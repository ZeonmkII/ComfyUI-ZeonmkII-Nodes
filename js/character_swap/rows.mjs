// ZeonmkII Character Swap — DOM rows (pure build) + CSS + height math. No event
// listeners here; interact.mjs attaches ONE delegated handler on the widget
// element and dispatches on the data-act attributes this module stamps. index.js
// owns the widget stack, sizing and value interceptors.
//
// The look is the LoRAs Loader's row language (lora_loader/render.mjs), repointed
// at Character Swap's NATIVE widgets: every DOM control reads and writes a real
// widget value, so the proven save/restore machinery (by-name restore guard,
// v0.3.0) keeps working untouched. Row 1 = LoRA + model/clip strengths + text-only
// toggle + on/off switch; row 2 = trigger word.

import { ZEON } from "../zeonmkii_skin.js";
import { hasLora } from "../lora_loader/api.mjs";

export const MAX_SLOTS = 8;
export const WIDGET_NAME = "zeon_cswap_rows";

// Height constants — kept in lockstep with the CSS below (same law as the
// loader: the node hugs its content with no bottom gap and no scrollbar, and
// getMinHeight in index.js reads contentHeight).
const PAD = 9;
const CFG_H = 26;
const CFG_GAP = 8;
const R1_H = 32;      // LoRA + strengths row
const R2_H = 26;      // trigger row
const R1GAP = 4;
const SLOT_GAP = 8;
export const SLOT_H = R1_H + R1GAP + R2_H; // 62

export function contentHeight(n) {
  const k = Math.max(1, Math.min(MAX_SLOTS, n | 0));
  return PAD + CFG_H + CFG_GAP + k * SLOT_H + (k - 1) * SLOT_GAP + PAD;
}

export function findWidget(node, name) {
  return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

// ── display helpers (local copies of the loader's render.mjs pair) ──────────
function baseName(name) {
  if (!name) return "";
  const i = name.replace(/\\/g, "/").lastIndexOf("/");
  return i < 0 ? name : name.slice(i + 1);
}
// Strip a KNOWN model extension only (allowlist, not "everything after the last
// dot") so "MoXin_v1.0" keeps its ".0". Display only — titles keep the real name.
const LORA_EXT_RE = /\.(safetensors|safetensor|ckpt|pt|pth|bin|sft)$/i;
function displayName(name) {
  return baseName(name).replace(LORA_EXT_RE, "");
}

export function injectRowsCSS() {
  if (document.getElementById("z-cs-css")) return;
  const s = document.createElement("style");
  s.id = "z-cs-css";
  s.textContent = `
    .z-cs-root { width:100%; box-sizing:border-box; background:#141414; border-radius:4px;
      color:#ddd; font-family:ui-sans-serif,system-ui,sans-serif; font-size:11px; position:relative; }
    /* Plain block flow (NOT flex on the root, NOT absolute) — Sizes Pattern #4. */
    .z-cs-inner { box-sizing:border-box; padding:${PAD}px; }

    /* ── config strip: chars · pick · rand ───────────────────────────────── */
    .z-cs-cfg { display:flex; align-items:center; gap:6px; height:${CFG_H}px; }
    .z-cs-lab { flex:0 0 auto; font:9px 'Segoe UI',sans-serif; color:#8a8a8a;
      letter-spacing:.6px; text-transform:uppercase; }
    .z-cs-cfg .dim { opacity:.38; }
    .z-cs-dash { flex:0 0 auto; color:#555; }
    .z-cs-nb { flex:0 0 auto; display:flex; align-items:center; height:24px; width:46px;
      background:#101010; border:1px solid #262626; border-radius:5px; overflow:hidden; }
    .z-cs-nb:focus-within { border-color:var(--acc,${ZEON.ACCENT}); }
    .z-cs-nb.dis { opacity:.38; }
    .z-cs-nval { flex:1; min-width:0; width:100%; background:transparent; border:0; outline:none;
      color:#fff; text-align:center; font:11px monospace; padding:0; }
    .z-cs-nbtn { flex:1; border:0; background:transparent; color:#9a9a9a; cursor:pointer;
      font-size:7px; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
    .z-cs-nbtn:hover { color:var(--acc,${ZEON.ACCENT}); background:rgba(255,255,255,0.06); }
    .z-cs-nspin { flex:0 0 auto; display:flex; flex-direction:column; width:14px; height:100%;
      border-left:1px solid #262626; }

    /* ── slot rows ────────────────────────────────────────────────────────── */
    .z-cs-rows { display:flex; flex-direction:column; gap:${SLOT_GAP}px; }
    .z-cs-slot { display:flex; flex-direction:column; gap:${R1GAP}px; }
    .z-cs-slot.benched { opacity:.42; }

    .z-cs-r1 { box-sizing:border-box; height:${R1_H}px; display:flex; align-items:center; gap:5px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:6px;
      padding:0 6px; }
    .z-cs-num { flex:0 0 auto; width:20px; text-align:center; font:600 10px monospace; }

    .z-cs-name { flex:1; min-width:0; height:24px; display:flex; align-items:center; gap:5px;
      background:#101010; border:1px solid #262626; border-radius:5px; padding:0 8px;
      font:11px monospace; color:#ddd; cursor:pointer; overflow:hidden; }
    .z-cs-name:hover { border-color:var(--acc,${ZEON.ACCENT}); }
    .z-cs-name .nm { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .z-cs-name.none .nm { color:#777; font-style:italic; }
    .z-cs-name.missing .nm { color:#ff5555; }
    .z-cs-name.missing::before { content:"⚠"; flex:none; color:#ff5555; font-size:11px; }
    .z-cs-name .car { flex:none; color:#777; font-size:9px; }

    .z-cs-w { flex:0 0 auto; display:flex; align-items:center; height:24px; width:56px;
      background:#101010; border:1px solid #262626; border-radius:5px; overflow:hidden; }
    .z-cs-w:focus-within { border-color:var(--acc,${ZEON.ACCENT}); }
    .z-cs-wval { flex:1; min-width:0; width:100%; background:transparent; border:0; outline:none;
      color:#fff; text-align:center; font:11px monospace; padding:0; }
    .z-cs-wspin { flex:0 0 auto; display:flex; flex-direction:column; width:15px; height:100%;
      border-left:1px solid #262626; }
    .z-cs-wbtn { flex:1; border:0; background:transparent; color:#9a9a9a; cursor:pointer;
      font-size:7px; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
    .z-cs-wbtn:hover { color:var(--acc,${ZEON.ACCENT}); background:rgba(255,255,255,0.06); }

    .z-cs-none { flex:0 0 auto; width:22px; height:22px; border-radius:5px;
      border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:#a8a8a8;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      font:12px 'Segoe UI',sans-serif; padding:0; }
    .z-cs-none.on { color:#fff; border-color:var(--acc,${ZEON.ACCENT}); }
    .z-cs-none:hover { border-color:var(--acc,${ZEON.ACCENT}); }

    .z-cs-sw { flex:0 0 auto; width:30px; height:16px; border-radius:99px; background:#262626;
      position:relative; cursor:pointer; border:1px solid #000; }
    .z-cs-sw::after { content:""; position:absolute; top:1px; left:1px; width:12px; height:12px;
      border-radius:50%; background:#8a8a8a; transition:left .14s, background .14s; }
    .z-cs-sw.on { background:var(--acc,${ZEON.ACCENT}); }
    .z-cs-sw.on::after { left:15px; background:#fff; }

    .z-cs-r2 { box-sizing:border-box; height:${R2_H}px; display:flex; align-items:center;
      background:#101010; border:1px solid #262626; border-radius:5px; padding:0 8px; }
    .z-cs-r2:focus-within { border-color:var(--acc,${ZEON.ACCENT}); }
    .z-cs-trig { flex:1; min-width:0; background:transparent; border:0; outline:none;
      color:#ddd; font:11px monospace; }
    .z-cs-trig::placeholder { color:#555; }
  `;
  document.head.appendChild(s);
}

// The held-root pattern from the loader: paint only into a root we can still
// resolve (the widget's element or our memo). Return null rather than painting
// a detached corpse; the next event/poll re-resolves.
export function ensureRoot(node) {
  const held = node._zeonCsRoot;
  if (held && held.isConnected) { node._zeonCsRootMounted = true; return held; }
  const w = (node.widgets || []).find((x) => x.name === WIDGET_NAME);
  const el = w?.element;
  const elRoot = el?.classList?.contains?.("z-cs-root") ? el : el?.querySelector?.(".z-cs-root");
  if (elRoot) { node._zeonCsRoot = elRoot; node._zeonCsRootMounted = true; return elRoot; }
  return node._zeonCsRootMounted ? null : (held || null);
}

// One config number box: typeable value + ▲▼ spinner. `key` is chars/pick/rmin/
// rmax; the delegated handler in interact.mjs maps it to the native widget.
function nbox(node, key, label, nativeName, title, dim) {
  const wrap = document.createElement("div");
  wrap.className = dim ? "dim" : "";
  const box = document.createElement("div");
  box.className = "z-cs-nb";
  const w = findWidget(node, nativeName);
  const val = document.createElement("input");
  val.className = "z-cs-nval";
  val.dataset.act = "nval";
  val.dataset.k = key;
  val.type = "text";
  if (!w) {
    val.disabled = true;
    val.value = "⚡";
    box.classList.add("dis");
    box.title = `${title} — driven by a connected input`;
  } else {
    val.value = String(parseInt(w.value, 10) || 0);
    box.title = title;
  }
  const spin = document.createElement("div");
  spin.className = "z-cs-nspin";
  const mk = (act, glyph) => {
    const b = document.createElement("button");
    b.className = "z-cs-nbtn"; b.dataset.act = act; b.dataset.k = key;
    b.textContent = glyph; b.tabIndex = -1; b.disabled = !w;
    return b;
  };
  spin.append(mk("ninc", "▲"), mk("ndec", "▼"));
  box.append(val, spin);
  wrap.appendChild(box);
  if (label) {
    const lab = document.createElement("div");
    lab.className = "z-cs-lab";
    lab.textContent = label;
    wrap.prepend(lab);
  }
  return wrap;
}

// One strength box (loader weightBox clone): typeable + ▲▼. which = "m" | "c".
function wbox(value, i, which, disabled) {
  const w = document.createElement("div");
  w.className = "z-cs-w";
  const val = document.createElement("input");
  val.className = "z-cs-wval";
  val.dataset.act = which === "c" ? "wcval" : "wmval";
  val.dataset.i = String(i);
  val.type = "text";
  val.value = Number(value).toFixed(2);
  val.disabled = !!disabled;
  val.title = which === "c" ? "Clip strength" : "Strength — type a value or use the arrows";
  const spin = document.createElement("div");
  spin.className = "z-cs-wspin";
  const up = document.createElement("button");
  up.className = "z-cs-wbtn"; up.dataset.act = which === "c" ? "wcinc" : "winc";
  up.dataset.i = String(i); up.textContent = "▲"; up.tabIndex = -1; up.disabled = !!disabled;
  const dn = document.createElement("button");
  dn.className = "z-cs-wbtn"; dn.dataset.act = which === "c" ? "wcdec" : "wdec";
  dn.dataset.i = String(i); dn.textContent = "▼"; dn.tabIndex = -1; dn.disabled = !!disabled;
  spin.append(up, dn);
  w.append(val, spin);
  return w;
}

export function renderRows(node) {
  const root = ensureRoot(node);
  if (!root) return;
  let inner = root.querySelector(".z-cs-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "z-cs-inner";
    root.appendChild(inner);
  }

  const cw = findWidget(node, "char_count");
  const count = Math.max(1, Math.min(MAX_SLOTS, (parseInt(cw?.value, 10) || 4)));
  const mode = String(findWidget(node, "select_mode")?.value ?? "manual");
  inner.style.setProperty("--acc", ZEON.ACCENT);
  inner.innerHTML = "";

  // ── config strip ─────────────────────────────────────────────────────────
  const cfg = document.createElement("div");
  cfg.className = "z-cs-cfg";
  cfg.append(
    nbox(node, "chars", "chars", "char_count", "How many character slots are active", false),
    nbox(node, "pick", "pick", "selection", "Manual mode: which character (1-based)", mode === "random"),
  );
  const randWrap = document.createElement("div");
  randWrap.className = mode === "manual" ? "dim" : "";
  randWrap.style.display = "flex";
  randWrap.style.alignItems = "center";
  randWrap.style.gap = "6px";
  const rl = document.createElement("div");
  rl.className = "z-cs-lab";
  rl.textContent = "rand";
  const dash = document.createElement("span");
  dash.className = "z-cs-dash";
  dash.textContent = "–";
  randWrap.append(
    rl,
    nbox(node, "rmin", null, "random_min", "Random mode: lowest selectable number", false),
    dash,
    nbox(node, "rmax", null, "random_max", "Random mode: highest selectable number", false),
  );
  cfg.appendChild(randWrap);
  inner.appendChild(cfg);

  // ── slot rows ────────────────────────────────────────────────────────────
  const rows = document.createElement("div");
  rows.className = "z-cs-rows";
  for (let i = 1; i <= count; i++) {
    const enabled = findWidget(node, "enabled_" + i)?.value !== false;
    const lora = String(findWidget(node, "lora_" + i)?.value ?? "None") || "None";
    const isNone = !lora || lora === "None";
    const wMissing = findWidget(node, "lora_" + i) == null; // slot converted to input
    const trigger = String(findWidget(node, "trigger_" + i)?.value ?? "");
    const sm = findWidget(node, "strength_model_" + i)?.value;
    const sc = findWidget(node, "strength_clip_" + i)?.value;

    const slot = document.createElement("div");
    slot.className = "z-cs-slot" + (enabled ? "" : " benched");

    // row 1: #N · LoRA name · str · clip_str · ∅ · on/off
    const r1 = document.createElement("div");
    r1.className = "z-cs-r1";

    const num = document.createElement("div");
    num.className = "z-cs-num";
    num.textContent = "#" + i;
    num.style.color = ZEON.SLOT_HUES[i - 1] || ZEON.ACCENT;
    num.title = "Character slot " + i;

    const name = document.createElement("div");
    // hasLora: null while the list is unknown (fetch in flight) — a slow fetch
    // must not flash a false missing mark; the warm-up repaint fixes it later.
    const missing = !isNone && !wMissing && hasLora(lora) === false;
    name.className = "z-cs-name" + (isNone ? " none" : "") + (missing ? " missing" : "");
    name.dataset.act = "name";
    name.dataset.i = String(i);
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = isNone ? "∅ text-only character" : displayName(lora);
    nm.title = isNone
      ? "Text-only — no LoRA applied, the trigger swap still happens"
      : (missing
        ? lora + " — file not found (renamed or removed?). This slot is skipped at run time."
        : lora);
    const car = document.createElement("span");
    car.className = "car";
    car.textContent = "▾";
    name.append(nm, car);

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "z-cs-none" + (isNone ? " on" : "");
    noneBtn.dataset.act = "none";
    noneBtn.dataset.i = String(i);
    noneBtn.textContent = "∅";
    noneBtn.title = isNone
      ? "Text-only character — click to pick a LoRA"
      : "Make this a text-only character (no LoRA)";

    const sw = document.createElement("div");
    sw.className = "z-cs-sw" + (enabled ? " on" : "");
    sw.dataset.act = "toggle";
    sw.dataset.i = String(i);
    sw.title = enabled ? "In the random pool — click to bench" : "Benched — click to include in random";

    r1.append(num, name, wbox(sm ?? 1, i, "m", wMissing || sm == null), wbox(sc ?? 0.3, i, "c", wMissing || sc == null), noneBtn, sw);

    // row 2: trigger word
    const r2 = document.createElement("div");
    r2.className = "z-cs-r2";
    const trig = document.createElement("input");
    trig.className = "z-cs-trig";
    trig.dataset.act = "tval";
    trig.dataset.i = String(i);
    trig.type = "text";
    trig.value = trigger;
    trig.placeholder = "#" + i + " trigger word — replaces the token in the prompt";
    trig.title = "Trigger word written into the prompt in place of the token";
    r2.appendChild(trig);

    slot.append(r1, r2);
    rows.appendChild(slot);
  }
  inner.appendChild(rows);
}
