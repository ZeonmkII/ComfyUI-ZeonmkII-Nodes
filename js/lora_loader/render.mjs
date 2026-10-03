// ZeonmkII LoRAs Loader - DOM build (pure) + CSS + height math. No event listeners
// here; interaction.mjs attaches ONE delegated handler on the widget element and
// dispatches on the data-act attributes this module stamps. index.js owns sizing
// and calls renderNode().

import { isVueNodes } from "../shared/nodes2.mjs";
import { BRAND, readState, accentOf, countOn, MAX_LORAS } from "./core.mjs";
import { hasLora } from "./api.mjs";

// Height constants - kept in lockstep with the CSS so the node hugs its content
// with no bottom gap and no scrollbar (getMinHeight in index.js reads contentHeight).
const PAD = 9;
const ADD_H = 28;
const TOP_GAP = 5;
const TOPROW_H = 26;
const AFTER_TOP = 9;
export const ROW_H = 32;
const ROW_GAP = 6;
const EMPTY_H = 46;

// The Add/All/gear cluster ("band"). In CLASSIC it FLOATS up out of flow into the
// empty band between the input dots (left) and output dots (right) - see the offset
// + reserves below - so it costs zero node height. In Nodes 2.0 (where floating a
// child above the widget top gets clipped by the node body) it stays in normal flow
// at the top. Branch is in renderNode.
const BAND_H = ADD_H + TOP_GAP + TOPROW_H; // 59
// Classic float: node-local px. The widget body starts ~66px below the node top; the
// 3-output slot band spans ~4..64, so lift the band ~62px to land it in that band.
// NOTE: these are calibrated to this node's slot layout (2 inputs / 3 outputs) - if a
// MODEL/CLIP/triggers slot is ever added or removed, re-tune these AND `CHROME` in
// index.js, or the band drifts out of the dead-band.
const CLASSIC_BAND_TOP = -62;
const CLASSIC_RSV_L = 64;   // clear the model / clip labels on the left
const CLASSIC_RSV_R = 80;   // clear the MODEL / CLIP / triggers labels on the right

export function contentHeight(state) {
  const n = state.loras.length;
  const rowsH = n ? n * ROW_H + (n - 1) * ROW_GAP : EMPTY_H;
  const bandInFlow = isVueNodes() ? BAND_H + AFTER_TOP : 0; // Classic floats it (free)
  return PAD + bandInFlow + rowsH + PAD;
}

const NO_LORAS = "(put LoRAs in models/loras)";
function baseName(name) {
  if (!name) return "";
  const i = name.replace(/\\/g, "/").lastIndexOf("/");
  return i < 0 ? name : name.slice(i + 1);
}

// Strip a trailing KNOWN model extension only (allowlist, not "everything after the
// last dot") so a versioned name like "MoXin_v1.0" keeps its ".0". Used for display
// only - the row's title keeps the real file name.
const LORA_EXT_RE = /\.(safetensors|safetensor|ckpt|pt|pth|bin|sft)$/i;
function displayName(name, hideExt) {
  const b = baseName(name);
  return hideExt ? b.replace(LORA_EXT_RE, "") : b;
}

// One weight box: a typeable value + a ▲▼ spinner. `which` is "m" (model) or "c"
// (clip); the data-act values let the delegated handler know which strength to set.
function weightBox(value, which) {
  const w = document.createElement("div");
  w.className = "z-ll-w";
  const val = document.createElement("input");
  val.className = "z-ll-wval";
  val.dataset.act = which === "c" ? "wcval" : "wval";
  val.type = "text";
  val.value = Number(value).toFixed(2);
  val.title = which === "c" ? "Clip strength" : "Strength - type a value or use the arrows";
  const spin = document.createElement("div");
  spin.className = "z-ll-wspin";
  const up = document.createElement("button");
  up.className = "z-ll-wbtn"; up.dataset.act = which === "c" ? "wcinc" : "winc"; up.textContent = "▲"; up.tabIndex = -1;
  const dn = document.createElement("button");
  dn.className = "z-ll-wbtn"; dn.dataset.act = which === "c" ? "wcdec" : "wdec"; dn.textContent = "▼"; dn.tabIndex = -1;
  spin.append(up, dn);
  w.append(val, spin);
  return w;
}

export function injectCSS() {
  if (document.getElementById("z-ll-css")) return;
  const s = document.createElement("style");
  s.id = "z-ll-css";
  s.textContent = `
    .z-ll-root { width:100%; box-sizing:border-box; background:#1d1d1d; border-radius:4px;
      color:#ddd; font-family:ui-sans-serif,system-ui,sans-serif; font-size:11px; position:relative; }
    /* Plain block flow (NOT flex, NOT absolute) so the list can never be squeezed
       (Sizes Pattern #4). Each child takes its natural height. */
    .z-ll-inner { box-sizing:border-box; padding:${PAD}px; }

    /* The Add / All / gear cluster. Floated (Classic) = lifted out of flow into the
       slot dead-band; in-flow (Nodes 2.0) = a normal top cluster. */
    .z-ll-band { display:flex; flex-direction:column; gap:${TOP_GAP}px; }
    .z-ll-band:not(.floated) { margin-bottom:${AFTER_TOP}px; }
    .z-ll-band.floated { position:absolute; pointer-events:none; z-index:2; }
    .z-ll-band.floated > * { pointer-events:auto; }

    .z-ll-add { box-sizing:border-box; width:100%; height:${ADD_H}px; border:0; border-radius:6px;
      background:var(--acc,${BRAND}); color:#fff; font:600 12px 'Segoe UI',sans-serif; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:6px; }
    .z-ll-add:hover { filter:brightness(1.08); }
    .z-ll-add:disabled { opacity:.4; cursor:default; filter:none; }

    .z-ll-toprow { display:flex; align-items:stretch; gap:6px; height:${TOPROW_H}px; }
    .z-ll-all { flex:1; min-width:0; display:flex; align-items:center; gap:8px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.14); border-radius:5px;
      padding:0 9px; color:#a8a8a8; cursor:pointer; user-select:none; }
    .z-ll-all:hover { border-color:var(--acc,${BRAND}); color:#ddd; }
    .z-ll-all .cnt { font-size:11px; white-space:nowrap; }
    .z-ll-gear { flex:0 0 auto; width:32px; display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.14); border-radius:5px;
      cursor:pointer; user-select:none; }
    /* The bundled gear SVG as a mask, NOT the ⚙ emoji: an emoji is drawn by the
       operating system, so it is a different shape on Windows, Mac and Linux and
       on some of them it arrives in colour. This is the same icon as the gear on
       the node selection toolbar and on Dropdown Pixaroma. */
    .z-ll-gear::before { content:""; display:block; width:14px; height:14px; background:#bbb;
      -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'/%3E%3C/svg%3E") center/contain no-repeat;
      mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'/%3E%3C/svg%3E") center/contain no-repeat; }
    .z-ll-gear:hover { border-color:var(--acc,${BRAND}); }
    .z-ll-gear:hover::before { background:var(--acc,${BRAND}); }

    .z-ll-rows { display:flex; flex-direction:column; gap:${ROW_GAP}px; }
    .z-ll-row { box-sizing:border-box; height:${ROW_H}px; display:flex; align-items:center; gap:6px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:6px;
      padding:0 6px; }
    .z-ll-row.off { opacity:.42; }

    .z-ll-name { flex:1; min-width:0; height:24px; display:flex; align-items:center; gap:5px;
      background:#161616; border:1px solid #3a3a3a; border-radius:5px; padding:0 8px;
      font:11px monospace; color:#ddd; cursor:pointer; overflow:hidden; }
    .z-ll-name:hover { border-color:var(--acc,${BRAND}); }
    .z-ll-name .nm { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .z-ll-name.empty .nm { color:#777; }
    .z-ll-name.missing .nm { color:#e05555; }
    .z-ll-name.missing::before { content:"⚠"; flex:none; color:#e05555; font-size:11px; }
    .z-ll-name .car { flex:none; color:#777; font-size:9px; }

    .z-ll-w { flex:0 0 auto; display:flex; align-items:center; height:24px; width:56px;
      background:#161616; border:1px solid #3a3a3a; border-radius:5px; overflow:hidden; }
    .z-ll-w:focus-within { border-color:var(--acc,${BRAND}); }
    .z-ll-wval { flex:1; min-width:0; width:100%; background:transparent; border:0; outline:none;
      color:#fff; text-align:center; font:11px monospace; padding:0; }
    .z-ll-wval::-webkit-outer-spin-button,.z-ll-wval::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
    .z-ll-wspin { flex:0 0 auto; display:flex; flex-direction:column; width:15px; height:100%;
      border-left:1px solid #3a3a3a; }
    .z-ll-wbtn { flex:1; border:0; background:transparent; color:#9a9a9a; cursor:pointer;
      font-size:7px; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
    .z-ll-wbtn:hover { color:var(--acc,${BRAND}); background:rgba(255,255,255,0.06); }

    .z-ll-info { flex:0 0 auto; width:22px; height:22px; border-radius:5px;
      border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:#a8a8a8;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      font:italic 12px Georgia,serif; }
    .z-ll-info:hover { border-color:var(--acc,${BRAND}); color:#fff; }

    .z-ll-sw { flex:0 0 auto; width:30px; height:16px; border-radius:99px; background:#3a3a3a;
      position:relative; cursor:pointer; border:1px solid #000; }
    .z-ll-sw::after { content:""; position:absolute; top:1px; left:1px; width:12px; height:12px;
      border-radius:50%; background:#8a8a8a; transition:left .14s, background .14s; }
    .z-ll-sw.on { background:var(--acc,${BRAND}); }
    .z-ll-sw.on::after { left:15px; background:#fff; }

    .z-ll-empty { box-sizing:border-box; height:${EMPTY_H}px;
      display:flex; align-items:center; justify-content:center; text-align:center; color:#777;
      font-size:11px; background:rgba(0,0,0,0.2); border:1px dashed #3a3a3a; border-radius:6px; padding:0 10px; }
  `;
  document.head.appendChild(s);
}

export function ensureRoot(node) {
  const held = node._pixLlRoot;
  if (held && held.isConnected) { node._pixLlRootMounted = true; return held; }
  const w = (node.widgets || []).find((x) => x.name === "loras_ui");
  const el = w?.element;
  const elRoot = el?.classList?.contains?.("z-ll-root") ? el : el?.querySelector?.(".z-ll-root");
  if (elRoot) { node._pixLlRoot = elRoot; node._pixLlRootMounted = true; return elRoot; }
  // Paint into a not-yet-connected root ONLY on the first paint (before it mounts, so
  // it shows the moment it does). If it was mounted before and is now lost + can't be
  // re-resolved, return null so renderNode no-ops instead of painting a detached
  // corpse - it re-resolves on the next event/poll.
  return node._pixLlRootMounted ? null : (held || null);
}

export function renderNode(node) {
  const root = ensureRoot(node);
  if (!root) return;
  let inner = root.querySelector(".z-ll-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "z-ll-inner";
    root.appendChild(inner);
  }
  node._pixLlInner = inner;

  const st = readState(node);
  const acc = accentOf(node);
  inner.style.setProperty("--acc", acc);
  inner.innerHTML = "";

  // ── the Add / All / gear band (floats into the slot dead-band in Classic) ──
  const band = document.createElement("div");
  band.className = "z-ll-band";
  const classic = !isVueNodes();
  if (classic) {
    band.classList.add("floated");
    band.style.top = CLASSIC_BAND_TOP + "px";
    band.style.left = CLASSIC_RSV_L + "px";
    band.style.right = CLASSIC_RSV_R + "px";
  }

  const add = document.createElement("button");
  add.className = "z-ll-add";
  add.dataset.act = "add";
  add.textContent = "＋ Add LoRA";
  add.disabled = st.loras.length >= MAX_LORAS;
  add.title = st.loras.length >= MAX_LORAS ? `Up to ${MAX_LORAS} LoRAs per node` : "Add a LoRA row";
  band.appendChild(add);

  // ── All on/off + count, and the gear ─────────────────────────────────────
  const on = countOn(st), total = st.loras.length;
  const toprow = document.createElement("div");
  toprow.className = "z-ll-toprow";
  const all = document.createElement("div");
  all.className = "z-ll-all";
  all.dataset.act = "allToggle";
  all.title = "Turn every LoRA on or off";
  const asw = document.createElement("span");
  asw.className = "z-ll-sw" + (total && on === total ? " on" : "");
  const cnt = document.createElement("span");
  cnt.className = "cnt";
  cnt.textContent = total ? `${on} / ${total} on` : "no LoRAs";
  all.append(asw, cnt);
  const gear = document.createElement("div");
  gear.className = "z-ll-gear";
  gear.dataset.act = "gear";
  // No textContent: the icon is drawn by the ::before mask above.
  gear.title = "LoRA Loader settings";
  toprow.append(all, gear);
  band.appendChild(toprow);
  inner.appendChild(band);

  // ── rows, or the empty state ─────────────────────────────────────────────
  if (!st.loras.length) {
    const empty = document.createElement("div");
    empty.className = "z-ll-empty";
    empty.textContent = "No LoRAs yet — click ＋ Add LoRA to stack your first one.";
    inner.appendChild(empty);
    return;
  }

  const rows = document.createElement("div");
  rows.className = "z-ll-rows";
  for (const e of st.loras) {
    const row = document.createElement("div");
    row.className = "z-ll-row" + (e.on ? "" : " off");
    row.dataset.id = e.id;

    const name = document.createElement("div");
    // hasLora returns null while the list is unknown (first load in flight) so a
    // slow fetch can't flash a false "missing" mark; the setup/refresh repaint
    // re-renders once the list lands. A row whose file is gone (renamed/removed)
    // is SKIPPED at run time with only a console line, so this mark is the one
    // place the user can actually SEE that the LoRA is not being applied.
    const missing = e.name ? hasLora(e.name) === false : false;
    name.className = "z-ll-name" + (e.name ? "" : " empty") + (missing ? " missing" : "");
    name.dataset.act = "name";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = e.name ? displayName(e.name, st.hideExt) : NO_LORAS;
    nm.title = missing
      ? e.name + " - file not found (renamed or removed?). This row is skipped; pick the file again."
      : (e.name || "Pick a LoRA");
    const car = document.createElement("span"); car.className = "car"; car.textContent = "▾";
    name.append(nm, car);

    const wm = weightBox(e.sm, "m");

    const info = document.createElement("div");
    info.className = "z-ll-info";
    info.dataset.act = "info";
    info.textContent = "i";
    info.title = "Info + pick trigger words";

    const sw = document.createElement("div");
    sw.className = "z-ll-sw" + (e.on ? " on" : "");
    sw.dataset.act = "toggle";
    sw.title = e.on ? "On - click to turn off" : "Off - click to turn on";

    row.append(name, wm);
    if (!st.linkStrength) row.appendChild(weightBox(e.sc, "c")); // separate model/clip
    row.append(info, sw);
    rows.appendChild(row);
  }
  inner.appendChild(rows);
}
