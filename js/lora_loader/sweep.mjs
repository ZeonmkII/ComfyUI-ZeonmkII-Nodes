// LoRA Loader ZeonmkII - the XY Plot sweep provider.
//
// This node keeps its whole stack in node.properties.loraLoaderState and injects it
// into the hidden LoraLoaderState input at queue time (Vue Compat #9), so it has NO
// widget for XY Plot to enumerate - which is why the node never showed up in the XY
// picker at all. Here we advertise each row's file / strengths as pickable axes and
// patch the state blob per cell. Registered through js/shared/sweep_targets.mjs so
// neither side imports the other's internals.
//
// Axis identity is `zeonlora:<row id>` + a subField ("name" | "sm" | "sc"). The row ID
// (not its position) is what gets SERIALIZED into the saved workflow, so reordering
// or deleting other rows never re-points a saved axis at the wrong LoRA.

import { registerSweepProvider } from "../shared/sweep_targets.mjs";
import {
  HIDDEN_INPUT, MIN_STRENGTH, MAX_STRENGTH, readState, promptState, roundStrength,
} from "./core.mjs";
import { listLoras, cachedLoras } from "./api.mjs";

const CLASS = "ZeonmkII LoRAs Loader";
// Namespaced so it can never collide with a real widget name on any node.
const PREFIX = "zeonlora:";

function owns(axis) {
  return !!(axis && typeof axis.widgetName === "string" && axis.widgetName.startsWith(PREFIX));
}

// Resolve a saved axis back to its row. Returns idx -1 when the row was deleted
// after the axis was picked (every caller then degrades instead of throwing).
function findRow(node, axis) {
  const st = readState(node);
  const rows = st.loras || [];
  const id = String(axis?.widgetName || "").slice(PREFIX.length);
  const idx = rows.findIndex((r) => r.id === id);
  return { st, rows, idx, row: idx >= 0 ? rows[idx] : null };
}

// "LoRA 3" - position based, so it reads the way the node looks. Display only:
// it is recomputed on every render, never stored on the axis.
function rowLabel(idx) {
  return "LoRA " + (idx + 1);
}

// The strength entries always read as "LoRA 1 <what it changes>", and nobody
// misreads THOSE. The file entry used to be the bare "LoRA 1", which reads as the
// name of a LoRA rather than as a slot in the stack - so people picked it expecting
// to have chosen a LoRA, then met a checklist of every LoRA on their machine and
// could not see what it was for. Naming the thing it changes puts it in the same
// shape as its siblings. Display only: the axis identity is the row id.
function subLabel(base, sf) {
  if (sf === "sm") return base + " strength";
  if (sf === "sc") return base + " clip strength";
  return base + " file";
}

// The sorted LoRA library, memoized on the cache ARRAY IDENTITY (api.mjs replaces the
// array, never mutates it, so identity is a safe cache key). Without this, enumerate()
// re-sorted the whole library once PER ROW, and it runs ~4x per XY render including the
// workflow-load render - tens of ms with a big library and a long stack.
let _libSrc = null;
let _libSorted = null;
function sortedLibrary() {
  const files = cachedLoras();
  // null = never fetched; [] = a successful scan of an empty folder. BOTH must read as
  // UNKNOWN here - see fileOptions.
  if (!files || !files.length) {
    try { listLoras(); } catch (_e) { /* warm-up only */ }
    return null;
  }
  if (files !== _libSrc) {
    _libSrc = files;
    _libSorted = [...files].sort();
  }
  return _libSorted;
}

// The available LoRA filenames, or [] meaning UNKNOWN.
//
// Returning [] rather than a short stand-in list is load-bearing: XY Plot re-reads a
// combo axis's options on every render INCLUDING the workflow-load render, and it
// overwrites the saved list with whatever we hand back as long as it is non-empty.
// Handing back "just the row's current file" while the library is unknown would
// replace a saved axis's whole checklist with ONE entry - which breaks the axis (its
// other ticked files get filtered out, so the plot collapses) and rewrites serialized
// state on a clean open (Vue Compat #18). Both an un-fetched cache AND a successful
// scan that found nothing count as unknown.
function fileOptions(current) {
  const lib = sortedLibrary();
  if (!lib) return [];
  // Keep the row's own pick selectable even if the file was renamed away on disk.
  if (!current || lib.includes(current)) return lib.slice();
  return [...lib, current].sort();
}

// Every pickable axis this node exposes: per row, the FILE plus its model strength,
// and its clip strength only when the node is in separate model/clip mode (with the
// strengths linked there is one number, and offering two would be a lie).
function enumerate(node) {
  const st = readState(node);
  const rows = st.loras || [];
  const out = [];
  const step = (typeof st.step === "number" && st.step > 0) ? st.step : 0.05;
  rows.forEach((row, i) => {
    const name = PREFIX + row.id;
    const base = rowLabel(i);
    // A row with no file yet: sweeping its STRENGTH alone changes nothing (Python drops
    // a nameless row entirely), so say so in the value preview rather than let the user
    // run a whole grid of identical squares. The entry stays offered because pairing it
    // with a file sweep on the other axis is a real use - X picks the LoRA, Y its weight.
    const noFile = !String(row.name || "").trim();
    const hint = noFile ? " (pick a LoRA for this row first)" : "";
    out.push({
      name, subField: "name", label: subLabel(base, "name"), type: "combo",
      options: fileOptions(row.name), cur: row.name || "(none)",
    });
    // precision 2 mirrors the node's own 2-decimal weights; realStep null means no
    // Snap toggle - people type exact weights like 0.35, not multiples of a grid.
    out.push({
      name, subField: "sm", label: subLabel(base, "sm"), type: "number",
      step, precision: 2, realStep: null, cur: String(row.sm) + hint,
    });
    if (!st.linkStrength) {
      out.push({
        name, subField: "sc", label: subLabel(base, "sc"), type: "number",
        step, precision: 2, realStep: null, cur: String(row.sc) + hint,
      });
    }
  });
  return out;
}

// Fresh meta for a saved axis, so a reloaded workflow rebuilds its file checklist
// and its number step from the live node.
function lookup(node, axis) {
  if (!owns(axis)) return null;
  // effectiveSubField, so a stale clip-strength axis (picked while separate, then
  // re-linked) still finds the entry it now drives and keeps refreshing its step and
  // precision, instead of returning null and quietly going stale.
  const { st } = findRow(node, axis);
  const sf = effectiveSubField(st, axis);
  return enumerate(node).find((e) => e.name === axis.widgetName && e.subField === sf) || null;
}

// The "now:" line under the picker.
function preview(node, axis) {
  const { row } = findRow(node, axis);
  if (!row) return "(row removed)";
  const sf = axis.subField || "name";
  const hint = String(row.name || "").trim() ? "" : " (pick a LoRA for this row first)";
  if (sf === "sm") return String(row.sm) + hint;
  if (sf === "sc") return String(row.sc) + hint;
  return row.name || "(none)";
}

// A LoRA file name short enough to sit inside a one-sentence note: folder and known
// extension dropped (the same reading the node's own rows give it), then capped.
const EXT_RE = /\.(safetensors|safetensor|ckpt|pt|pth|bin|sft)$/i;
function shortFile(name) {
  const base = String(name || "").split(/[\\/]/).pop().replace(EXT_RE, "");
  return base.length > 24 ? base.slice(0, 24) + "…" : base;
}

// The heads-up under the picker. THE confusion this node produces with XY Plot:
// an axis sweeps ONE row, so every OTHER switched-on row is applied to every
// square - reported from the wild as "I put 2 LoRAs in and only the first one is
// applied", because the fixed row masks whatever the swept row is doing. Say it
// where the axis is chosen instead of leaving people to work it out from a grid.
//
// A row parked at strength 0 is deliberately NOT counted: Python skips applying it
// (both strengths zero = a no-op), so it does not reach the picture and naming it
// would send the user hunting for something that is not there.
function note(node, axis, otherAxis) {
  const { rows, idx } = findRow(node, axis);
  if (idx < 0) return "";
  // A row the OTHER axis is sweeping is meant to be on: X = LoRA 1, Y = LoRA 2 is
  // the documented way to plot every combination of two LoRAs, and "switch it off"
  // would be advice that breaks exactly that grid. Only silence a row on THIS node
  // (the other axis can legitimately point at a different LoRA Loader).
  let otherIdx = -1;
  if (otherAxis && owns(otherAxis) && String(otherAxis.nodeId) === String(node.id)) {
    otherIdx = findRow(node, otherAxis).idx;
  }
  const others = rows.filter((r, i) => (
    i !== idx && i !== otherIdx && r.on && String(r.name || "").trim() && !(r.sm === 0 && r.sc === 0)
  ));
  if (!others.length) return "";
  if (others.length === 1) {
    const i = rows.indexOf(others[0]);
    return `${rowLabel(i)} (${shortFile(others[0].name)}) is on too, so it is in every square. `
      + `Switch it off to compare this row on its own.`;
  }
  return `${others.length} other LoRAs on this node are on too, so they are in every square. `
    + `Switch them off to compare this row on its own.`;
}

// The axis title drawn on the grid.
function displayName(node, axis) {
  const { st, idx } = findRow(node, axis);
  return subLabel(idx >= 0 ? rowLabel(idx) : "LoRA", effectiveSubField(st, axis));
}

// The sub-field an axis REALLY drives. A clip-strength axis picked while the gear was
// on separate model/clip keeps working after the user links the strengths again - and
// linked means one number drives both - so it collapses to the single strength. Both
// displayName and inject go through here so the label and the behaviour agree.
function effectiveSubField(st, axis) {
  const sf = axis.subField || "name";
  if (sf === "sc" && st.linkStrength) return "sm";
  return sf;
}

// A strength, clamped the way the node clamps its own weight field. Says so when the
// clamp actually bites, because the grid label is drawn from the UNCLAMPED axis value:
// a 0-20 sweep would otherwise print squares labelled 15 and 20 that both ran at 10.
function strengthOf(value) {
  const n = Number(value);
  const r = roundStrength(n);
  if (!Number.isFinite(n)) {
    // clampStrength turns a non-number into 0, which reads as a working row that just
    // does nothing. Not reachable from a number axis today, but it is the one input
    // class that would fail silently.
    console.warn(`[LoRA Loader ZeonmkII] XY Plot gave a strength that is not a number (${JSON.stringify(value)}); this square ran at ${r}.`);
    return r;
  }
  if (Math.abs(r - n) > 0.005) {
    console.warn(
      `[LoRA Loader ZeonmkII] XY Plot asked for a strength of ${n}, but LoRA strengths ` +
      `are limited to ${MIN_STRENGTH}..${MAX_STRENGTH} (2 decimals), so this square ran ` +
      `at ${r}. The grid label still shows ${n} - narrow the range to keep them honest.`,
    );
  }
  return r;
}

// The state already in the prompt, or a fresh one built from the node. Reading what
// is THERE is what makes two things work: X and Y can both patch the same node (the
// second composes on the first instead of discarding it), and it does not matter
// whether the node's own graphToPrompt hook has run yet - hook order between two
// wrappers is load-order dependent.
function currentPromptState(entry, st) {
  const raw = entry.inputs[HIDDEN_INPUT];
  if (typeof raw === "string" && raw) {
    try {
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.loras)) return o;
    } catch (_e) { /* fall through to a fresh build */ }
  }
  return promptState(st);
}

// Write this cell's value into the node's prompt entry.
function inject(entry, axis, value, node) {
  if (!entry || !owns(axis)) return;
  const { st, idx } = findRow(node, axis);
  if (idx < 0) {
    // The row was deleted after the axis was picked, so there is nothing to vary and
    // every square would come out identical. Say so - a silent no-op looks like a bug.
    console.warn("[LoRA Loader ZeonmkII] XY Plot is set to vary a LoRA row that no longer exists on this node - re-pick the axis.");
    return;
  }
  entry.inputs = entry.inputs || {};
  const ps = currentPromptState(entry, st);
  // promptState maps the rows 1:1, so the live index addresses the same row.
  const row = ps.loras && ps.loras[idx];
  if (!row) return;
  const sf = effectiveSubField(st, axis);
  if (sf === "sm") {
    row.sm = strengthOf(value);
    // Linked strengths: one number drives both, exactly as the node enforces it on
    // every write (core.mjs normalize). effectiveSubField routes a stale clip-strength
    // axis here too, so a sweep can never apply a mismatched CLIP weight.
    if (st.linkStrength) row.sc = row.sm;
  } else if (sf === "sc") {
    row.sc = strengthOf(value);
  } else {
    // Clear the picked trigger words for EVERY square, not only the ones whose file
    // differs from the row's current pick. They belonged to one specific LoRA (the
    // node clears them on a manual swap for the same reason), so keeping them would
    // hand exactly one square extra prompt text that none of the others get - an
    // invisible difference that quietly defeats the comparison.
    row.triggers = [];
    row.name = String(value);
  }
  // Sweeping a switched-off row would produce identical squares, so the swept row is
  // forced on - the same rule the multi-lora row sweep already follows.
  row.on = true;
  entry.inputs[HIDDEN_INPUT] = JSON.stringify(ps);
}

registerSweepProvider(CLASS, { owns, enumerate, lookup, preview, displayName, note, inject });
