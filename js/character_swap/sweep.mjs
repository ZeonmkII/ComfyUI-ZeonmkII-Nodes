// Character Swap ZeonmkII - the XY Plot sweep provider.
//
// The node's character rows live in per-slot NATIVE widgets (enabled_i / lora_i /
// trigger_i / strength_model_i / strength_clip_i), hidden under the DOM row view —
// which is why the XY picker only ever saw `token` and `random_seed`: it enumerates
// visible widgets. This provider advertises the hidden sweepable fields as axes and
// patches the node's PROMPT entry per cell — the live node is never written, so the
// v0.3.0 restore guard and save/restore are untouched.
//
// Unlike the LoRA Loader (every switched-on row applies), this node applies exactly
// ONE character per run: the picked slot's LoRA + trigger. So every injected value
// also forces its slot to be the active one (manual mode, enabled), otherwise a sweep
// would produce a grid of identical squares.
//
// Axis identity: `zeonchar:active` (which character runs) or `zeonchar:<slot>` with a
// subField ("name" | "sm" | "sc"). Slots are positional and stable here (widgets are
// named per slot; Python reads them by name), so a slot NUMBER — not a row id — is
// the serialized identity.

import { registerSweepProvider } from "../shared/sweep_targets.mjs";
import { findWidget, MAX_SLOTS } from "./rows.mjs";
import { listLoras, cachedLoras } from "../lora_loader/api.mjs";

const CLASS = "ZeonmkII Character Swap";
// Namespaced so it can never collide with a real widget name on any node.
const PREFIX = "zeonchar:";
const SEL_ID = "active";
const STRENGTH_MIN = -10;   // matches the Python widget bounds
const STRENGTH_MAX = 10;
const STEP = 0.05;          // matches the Python widget step and the row ▲▼ boxes

function owns(axis) {
  return !!(axis && typeof axis.widgetName === "string" && axis.widgetName.startsWith(PREFIX));
}

function slotOfAxis(axis) {
  const id = String(axis?.widgetName || "").slice(PREFIX.length);
  return id === SEL_ID ? "active" : parseInt(id, 10);
}

function countOf(node) {
  const n = parseInt(findWidget(node, "char_count")?.value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_SLOTS, n)) : 4;
}

// Live slot state, with the node's own defaults for anything unreadable.
function slotState(node, i) {
  return {
    enabled: findWidget(node, "enabled_" + i)?.value !== false,
    lora: String(findWidget(node, "lora_" + i)?.value || "None") || "None",
    trigger: String(findWidget(node, "trigger_" + i)?.value || "").trim(),
    sm: Number(findWidget(node, "strength_model_" + i)?.value ?? 1.0),
    sc: Number(findWidget(node, "strength_clip_" + i)?.value ?? 0.3),
  };
}

function subLabel(slot, sf) {
  if (sf === "sm") return "Char #" + slot + " model strength";
  if (sf === "sc") return "Char #" + slot + " clip strength";
  return "Char #" + slot + " file";
}

// The sorted LoRA library, memoized on the cache ARRAY IDENTITY (api.mjs replaces the
// array, never mutates it). Same pattern as the loader's provider: without the memo,
// enumerate() re-sorted the library once per axis per render.
let _libSrc = null;
let _libSorted = null;
function sortedLibrary() {
  const files = cachedLoras();
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

// "None" first — text-only is the node's zero state and a legitimate sweep stop, not
// an error. The current pick stays selectable even if the file was renamed on disk.
function fileOptions(current) {
  const lib = sortedLibrary();
  const opts = lib ? lib.slice() : [];
  const cur = String(current || "None");
  if (cur !== "None" && !opts.includes(cur)) { opts.push(cur); opts.sort(); }
  return ["None", ...opts];
}

function enumerate(node) {
  const count = countOf(node);
  const out = [];
  const randomMode = String(findWidget(node, "select_mode")?.value ?? "manual") === "random";
  const sel = Math.max(1, Math.min(parseInt(findWidget(node, "selection")?.value, 10) || 1, count));
  // Only ENABLED slots are offered: a benched pick passes everything through
  // (Python's documented behavior), so a benched cell would read as a broken square.
  const options = [];
  for (let i = 1; i <= count; i++) {
    if (slotState(node, i).enabled) options.push("#" + i);
  }
  if (!options.length) options.push("#" + sel); // degenerate all-benched node: keep it sweepable
  out.push({
    name: PREFIX + SEL_ID, subField: "sel",
    label: "Active character (which one runs)",
    type: "combo", options,
    cur: "#" + sel + (randomMode ? " · 🎲 random" : ""),
  });
  for (let i = 1; i <= count; i++) {
    const st = slotState(node, i);
    const name = PREFIX + i;
    out.push({
      name, subField: "name", label: subLabel(i, "name"), type: "combo",
      options: fileOptions(st.lora), cur: st.lora === "None" ? "None (text-only)" : st.lora,
    });
    const hint = st.lora === "None" ? " (text-only — no LoRA to weight)" : "";
    out.push({
      name, subField: "sm", label: subLabel(i, "sm"), type: "number",
      step: STEP, precision: 2, realStep: null, cur: String(st.sm) + hint,
    });
    out.push({
      name, subField: "sc", label: subLabel(i, "sc"), type: "number",
      step: STEP, precision: 2, realStep: null, cur: String(st.sc) + hint,
    });
  }
  return out;
}

// Fresh meta for a saved axis, rebuilt from the live node. Returns null when the slot
// is now beyond char_count — the axis reads as stale and degrades instead of throwing.
function lookup(node, axis) {
  if (!owns(axis)) return null;
  const sf = axis.subField || (slotOfAxis(axis) === "active" ? "sel" : "name");
  return enumerate(node).find((e) => e.name === axis.widgetName && e.subField === sf) || null;
}

function preview(node, axis) {
  const slot = slotOfAxis(axis);
  if (slot === "active") {
    const count = countOf(node);
    const sel = Math.max(1, Math.min(parseInt(findWidget(node, "selection")?.value, 10) || 1, count));
    const st = slotState(node, sel);
    const trig = st.trigger || "(no trigger)";
    return "#" + sel + " · " + trig + " · " + (st.lora === "None" ? "text-only" : st.lora)
      + (st.enabled ? "" : " (benched — pass-through)");
  }
  if (!(slot >= 1) || slot > countOf(node)) return "(slot beyond char count)";
  const st = slotState(node, slot);
  const sf = axis.subField || "name";
  if (sf === "sm") return String(st.sm);
  if (sf === "sc") return String(st.sc);
  return st.lora === "None" ? "None (text-only)" : st.lora;
}

function displayName(node, axis) {
  const slot = slotOfAxis(axis);
  if (slot === "active") return "Active character";
  const sf = axis.subField || "name";
  if (sf === "sm") return "Char #" + slot + " · model strength";
  if (sf === "sc") return "Char #" + slot + " · clip strength";
  return "Char #" + slot + " · file";
}

// The heads-up under the picker. Two CharSwap-specific traps:
//
// 1. MODE. In 🎲 Random the node ignores `selection` entirely, so any sweep here
//    would be invisible. Injection therefore forces ✋ Manual per CELL (in the
//    submitted prompt only — the node itself stays exactly as the user left it).
//
// 2. THE OTHER AXIS. Only the active character reaches the picture, and every axis
//    here forces its own notion of "active". Two axes fighting over it (sel vs a
//    different slot, or two different slots) means the last injection wins per cell
//    and the grid silently collapses. Same-node fights are named where the axis is
//    chosen. Two axes on the SAME slot don't fight (file + strength on one character
//    is the good grid) and are left alone.
function note(node, axis, otherAxis) {
  const slot = slotOfAxis(axis);
  if (otherAxis && owns(otherAxis) && String(otherAxis.nodeId) === String(node.id)) {
    const other = slotOfAxis(otherAxis);
    const sameTarget = slot === "active" ? other === "active" : other === slot;
    if (!sameTarget) {
      return "Both axes pick the active character on this node — they would fight and the grid would come out wrong. Point one of them at another node (or make both target the same slot).";
    }
  }
  if (String(findWidget(node, "select_mode")?.value ?? "manual") === "random") {
    return "This node is in 🎲 Random, which ignores the pick — the sweep runs every cell in ✋ Manual (in the submitted prompt only; your node is untouched).";
  }
  return "";
}

// A strength, clamped the way the node's own boxes clamp. Says so when the clamp
// bites, because the grid label is drawn from the UNCLAMPED axis value.
function strengthOf(value) {
  const n = Number(value);
  const r = Math.round(Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, n)) * 100) / 100;
  if (!Number.isFinite(n)) {
    console.warn(`[Character Swap ZeonmkII] XY Plot gave a strength that is not a number (${JSON.stringify(value)}); this square ran at ${r}.`);
    return r;
  }
  if (Math.abs(r - n) > 0.005) {
    console.warn(
      `[Character Swap ZeonmkII] XY Plot asked for a strength of ${n}, but character strengths ` +
      `are limited to ${STRENGTH_MIN}..${STRENGTH_MAX} (2 decimals), so this square ran ` +
      `at ${r}. The grid label still shows ${n} - narrow the range to keep them honest.`,
    );
  }
  return r;
}

// Force slot `i` to be the character this cell actually renders — otherwise the node
// would apply whatever is selected and the sweep would produce identical squares.
// Prompt-level only: the live node is never written (restore discipline).
function forceActive(entry, i) {
  entry.inputs["select_mode"] = "manual";
  entry.inputs["selection"] = i;
  entry.inputs["enabled_" + i] = true;
}

// Write this cell's value into the node's prompt entry.
function inject(entry, axis, value, node) {
  if (!entry || !owns(axis)) return;
  entry.inputs = entry.inputs || {};
  const slot = slotOfAxis(axis);
  const sf = axis.subField || (slot === "active" ? "sel" : "name");

  if (slot === "active") {
    const n = parseInt(String(value).replace(/^#/, ""), 10);
    if (!(n >= 1 && n <= MAX_SLOTS)) {
      console.warn(`[Character Swap ZeonmkII] XY Plot produced an unusable active-character value (${JSON.stringify(value)}); the square ran with the node's own selection.`);
      return;
    }
    forceActive(entry, n);
    return;
  }
  if (!(slot >= 1) || slot > MAX_SLOTS) return;

  if (sf === "name") {
    entry.inputs["lora_" + slot] = String(value || "None");
    // Trigger words are deliberately NOT cleared (unlike the loader's provider): a
    // CharSwap trigger is the character's hand-set identity, and keeping it across a
    // file sweep is the point of comparing files for one character.
    forceActive(entry, slot);
  } else if (sf === "sm") {
    entry.inputs["strength_model_" + slot] = strengthOf(value);
    forceActive(entry, slot);
  } else if (sf === "sc") {
    entry.inputs["strength_clip_" + slot] = strengthOf(value);
    forceActive(entry, slot);
  }
}

registerSweepProvider(CLASS, { owns, enumerate, lookup, preview, displayName, note, inject });
