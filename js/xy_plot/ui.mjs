// XY Plot ZeonmkII - node-body DOM: axis cards, target dropdown, adaptive
// value entry, counter, option toggles. All CSS is `.z-xy-*` scoped.
//
// Render model (mirrors Load Image Pattern #5): picker/mode changes do a full
// rebuild (handlers.rerender), but typing into value fields only updates state
// + refreshes the counter/preview in place (no rebuild) so input focus is kept.

import { app } from "../../../scripts/app.js";
import { zeonApiUrl } from "../shared/api_url.mjs";
import {
  readState, writeState,
  enumerateTargets, lookupWidgetMeta, currentValuePreview, axisDisplayName, axisNote,
  resolveAxisValues, computeCounts, axisReady, setLiveAxisMeta,
} from "./core.mjs";
import { isGraphLoading } from "../shared/graph_loading.mjs";

const BRAND = "#A20000";

// Node Help panel content (the ? button -> themed popup; node UI convention #16).
// The popup is a document.body overlay, so it works in BOTH renderers.

function xyToast(detail, severity = "info") {
  const tm = app.extensionManager?.toast;
  if (tm && typeof tm.add === "function") {
    try { tm.add({ severity, summary: "XY Plot", detail, life: 4000 }); return; } catch (_e) {}
  }
  console.warn("[ZeonmkII.XYPlot] " + detail);
}

export function injectCSS() {
  // DOM-id guard (survives a module hot-reload without duplicating the style).
  if (document.getElementById("z-xy-css")) return;
  const css = `
.z-xy-root{display:flex;flex-direction:column;gap:9px;padding:8px 9px 16px;font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0e0;box-sizing:border-box;}
.z-xy-axis{border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:9px 10px 10px;background:rgba(0,0,0,.18);}
.z-xy-axis-head{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:12px;font-weight:600;margin-bottom:8px;}
.z-xy-badge{background:var(--zeon-acc,#A20000);color:#fff;border-radius:4px;width:18px;height:18px;display:grid;place-items:center;font-size:11px;font-weight:700;flex:0 0 auto;}
.z-xy-axis-dir{color:#9a9a9a;font-weight:500;font-size:11px;}
.z-xy-head-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.z-xy-axis-reset{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:500;color:#9a9a9a;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:3px 8px;cursor:pointer;user-select:none;}
.z-xy-axis-reset:hover{border-color:var(--zeon-acc,#A20000);color:#fff;}
.z-xy-axis-reset .z-xy-axis-reset-ic{font-size:12px;line-height:1;}
.z-xy-row{display:flex;align-items:center;gap:7px;}
.z-xy-curhint{font-size:10.5px;color:#8a8a8a;font-style:italic;margin:5px 2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* Heads-up from the target node's sweep provider (e.g. "another LoRA row is on too,
   so it is in every square"). Wraps rather than ellipsising - it is a sentence, and
   a truncated warning is worse than none. */
.z-xy-axisnote{font-size:10.5px;line-height:1.35;color:var(--zeon-acc,#A20000);margin:4px 2px 0;display:flex;gap:5px;align-items:flex-start;}
.z-xy-axisnote .z-xy-axisnote-ic{flex:0 0 auto;}
/* Says what the checklist below it is for (values, one square per tick). */
.z-xy-listcapt{font-size:10.5px;line-height:1.35;color:#8a8a8a;margin:0 2px 5px;}
/* custom dropdown (value + ▼ + ◀▶), ZeonmkII convention - never native <select> */
.z-xy-combo{flex:1;display:flex;align-items:center;gap:8px;min-width:0;background:#1d1d1d;border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:6px 9px;font-size:12.5px;cursor:pointer;}
.z-xy-combo:hover{border-color:var(--zeon-acc,#A20000);}
.z-xy-combo .z-xy-val{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.z-xy-combo .z-xy-val .z-xy-node{color:var(--zeon-acc,#A20000);font-weight:600;}
.z-xy-combo .z-xy-val.placeholder{color:#777;}
.z-xy-combo .z-xy-car{color:#9a9a9a;font-size:10px;flex:0 0 auto;}
.z-xy-nav{width:22px;height:30px;flex:0 0 auto;display:grid;place-items:center;background:#1d1d1d;border:1px solid rgba(255,255,255,.14);border-radius:5px;color:var(--zeon-acc,#A20000);font-size:11px;cursor:pointer;}
.z-xy-nav:hover{border-color:var(--zeon-acc,#A20000);}
.z-xy-nav.disabled{opacity:.35;cursor:default;}
/* popup
// Popup sizes are px (12px base), independent of canvas zoom.
   the canvas zoom, and em lets that one number scale the rows, gaps and padding
   together (node UI convention #27 - the popup is position:fixed on
   document.body so it inherits no canvas transform and would otherwise read
   tiny beside a zoomed-in node). Do not put px back on the rows. At 100% zoom
   the em values reproduce the previous px sizes exactly. */
.z-xy-popup{position:fixed;z-index:99999;background:#1d1d1d;border:1px solid rgba(255,255,255,.18);border-radius:7px;box-shadow:0 10px 30px rgba(0,0,0,.6);max-height:340px;overflow:auto;padding:5px;min-width:220px;box-sizing:border-box;}
.z-xy-pop-section{font-size:10px;color:var(--zeon-acc,#A20000);font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px 3px;}
.z-xy-pop-item{display:flex;flex-direction:column;gap:1px;padding:6px 9px;border-radius:4px;font-size:12.5px;cursor:pointer;}
.z-xy-pop-item:hover{background:#2a2a2a;}
.z-xy-pop-item.sel{background:color-mix(in srgb, var(--zeon-acc,#A20000) 18%, transparent);}
.z-xy-pop-item-top{display:flex;align-items:center;gap:8px;}
.z-xy-pop-item .z-xy-wname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.z-xy-pop-item .z-xy-wtype{font-size:9.5px;color:#888;flex:0 0 auto;}
.z-xy-pop-prev{font-size:9.5px;color:#8a8a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}
.z-xy-empty{padding:10px;color:#888;font-size:12px;text-align:center;}
/* Scoped so the shared px rules above keep their size in the NODE BODY (the
   checklist reuses .z-xy-empty, and the font shorthand on .z-xy-input would
   otherwise pin the popup's filter box at 12px while the rows scale).
   NOTE: no backticks in this comment - it lives inside a JS template literal,
   where a backtick ends the string and empties the whole module. */
.z-xy-popup .z-xy-empty{padding:10px;font-size:12px;}
.z-xy-popup .z-xy-input{font-size:12px;}
/* value area */
.z-xy-valuearea{margin-top:9px;}
.z-xy-seg{display:inline-flex;background:rgba(0,0,0,.3);border-radius:6px;padding:2px;gap:2px;margin-bottom:8px;}
.z-xy-moderow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}
.z-xy-moderow .z-xy-seg{margin-bottom:0;}
.z-xy-seg span{font-size:11.5px;padding:4px 11px;border-radius:4px;color:#9a9a9a;cursor:pointer;user-select:none;}
/* Selected = orange pill + white text at the SAME weight as unselected. Bumping
   the weight would widen the label and shift the whole dark bar as you switch. */
.z-xy-seg span.on{background:var(--zeon-acc,#A20000);color:#fff;}
.z-xy-range{display:flex;gap:7px;margin-bottom:7px;}
.z-xy-field{flex:1;background:#1d1d1d;border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:4px 6px;min-width:0;cursor:text;}
.z-xy-field:focus-within{border-color:var(--zeon-acc,#A20000);}
.z-xy-field .z-xy-flbl{font-size:9px;color:var(--zeon-acc,#A20000);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:1px;}
.z-xy-field input{width:100%;background:transparent;border:none;outline:none;color:#e0e0e0;font-size:13px;padding:0;}
.z-xy-input{width:100%;box-sizing:border-box;background:#1d1d1d;border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:6px 8px;color:#e0e0e0;font:12px monospace;outline:none;}
.z-xy-input:focus{border-color:var(--zeon-acc,#A20000);}
/* WRAPS (pre-wrap, not pre): one value per line means the lines are whole
   prompts, and a straight un-wrapped line pushed them off the right edge behind
   a horizontal scrollbar (user report, 2026-08-02). Newlines still separate
   values - wrapping is purely visual, the value is always split on "\\n".
   min-height is ~5 wrapped rows because a wrapped prompt needs more room than
   an un-wrapped one did; resize:vertical still lets it be dragged bigger. */
textarea.z-xy-input{resize:vertical;min-height:92px;white-space:pre-wrap;overflow-wrap:break-word;}
.z-xy-preview{font-size:11.5px;color:#9a9a9a;background:rgba(0,0,0,.25);border-radius:5px;padding:6px 8px;margin-top:6px;word-break:break-word;}
.z-xy-preview b{color:#8fd19e;font-weight:600;}
.z-xy-check{max-height:140px;overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:5px;background:#1d1d1d;}
.z-xy-check .z-xy-item{display:flex;align-items:center;gap:8px;padding:5px 9px;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);}
.z-xy-check .z-xy-item:last-child{border-bottom:none;}
.z-xy-check .z-xy-item:hover{background:#262626;}
.z-xy-box{width:14px;height:14px;flex:0 0 auto;border-radius:3px;border:1.5px solid rgba(255,255,255,.25);display:grid;place-items:center;font-size:10px;color:#fff;}
.z-xy-box.ck{background:var(--zeon-acc,#A20000);border-color:var(--zeon-acc,#A20000);}
.z-xy-count{font-size:11px;color:#9a9a9a;margin-top:5px;}
/* counter chip + options */
.z-xy-counter{text-align:center;font-size:13px;font-weight:600;color:#fff;background:var(--zeon-acc,#A20000);border-radius:6px;padding:7px;}
.z-xy-counter.muted{background:rgba(255,255,255,.06);color:#9a9a9a;font-weight:500;}
.z-xy-opts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
.z-xy-opts2{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;}
.z-xy-opts3{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.z-xy-themewrap{display:flex;align-items:center;flex-wrap:wrap;gap:7px;}
.z-xy-themelbl{font-size:11.5px;color:#9a9a9a;}
.z-xy-themeseg{margin-bottom:0;}
.z-xy-themeseg span{padding:4px 10px;}
.z-xy-toggle{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#cfcfcf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:5px 11px;cursor:pointer;user-select:none;white-space:nowrap;}
.z-xy-toggle:hover{border-color:var(--zeon-acc,#A20000);}
.z-xy-pill{width:30px;height:16px;flex:0 0 auto;border-radius:8px;background:#444;position:relative;transition:.15s;}
.z-xy-pill.on{background:var(--zeon-acc,#A20000);}
.z-xy-pill .z-xy-knob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:.15s;}
.z-xy-pill.on .z-xy-knob{left:16px;}
.z-xy-resetbtn{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cfcfcf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:5px 11px;cursor:pointer;user-select:none;}
.z-xy-resetbtn:hover{border-color:var(--zeon-acc,#A20000);color:#fff;}
/* grid preview + buttons */
.z-xy-gridmount{display:flex;flex-direction:column;gap:8px;}
.z-xy-gridbox{border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#161616;min-height:60px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
/* max-height is set from JS (grid.mjs) so the preview SCALES with the node
   instead of freezing at a constant - a square or tall grid used to hit a flat
   360px cap and then never grow however wide you made the node (user report,
   2026-08-02). The 360 here is only the pre-JS fallback. */
.z-xy-gridimg{max-width:100%;max-height:360px;display:block;}
.z-xy-gridhint{color:#777;font-size:12px;padding:14px;text-align:center;}
.z-xy-savebar{display:flex;gap:6px;}
.z-xy-sb{flex:1;text-align:center;font-size:11px;color:#e0e0e0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:6px 4px;cursor:pointer;user-select:none;}
.z-xy-sb:hover{background:var(--zeon-acc,#A20000);border-color:var(--zeon-acc,#A20000);color:#fff;}
.z-xy-sb.disabled{opacity:.4;cursor:default;}
.z-xy-sb.disabled:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14);color:#e0e0e0;}
`;
  const tag = document.createElement("style");
  tag.id = "z-xy-css";
  tag.textContent = css;
  document.head.appendChild(tag);
}

// Below this root width the node has not been laid out yet and any height read
// off it is meaningless. The real root is ~400px inside a 420px node (MIN_W),
// and Nodes 2.0 never renders this body narrower than a couple of hundred, so
// nothing legitimate sits near this number.
const LAYOUT_READY_W = 100;

// The last trustworthy measurement per root, so an early call can answer with
// something plausible instead of a wild one. WeakMap: a removed node's root is
// collected with it.
const _lastGoodHeight = new WeakMap();

/**
 * Content height of the node body.
 *
 * ⚠️ A measurement taken before the node is laid out is GARBAGE, and it is
 * garbage in the DANGEROUS direction: with no usable width every text block
 * wraps, so the children measure several times their real height. MEASURED
 * during a workflow load on 2026-09-11: root width 18px, children
 * 693/693/135/98/100/50/208 = 2039 against a settled 113/113/31/27/28/27/96 =
 * 497. `getMinHeight` therefore answered 2060, core's _arrangeWidgets sized the
 * node to 2110px, and that height could be SAVED - the node flip-flopped
 * 553 <-> 566 across repeated opens and sometimes stuck at 2110.
 *
 * So refuse to answer until the root has a real width, and hand back the last
 * good value (or the old 280 fallback on the very first call). Every caller
 * then gets a plausible number: as a getMinHeight FLOOR it means core simply
 * keeps whatever the workflow saved, and the true floor applies on the next
 * call once the width is real.
 */
export function measureContentHeight(root) {
  if (!root) return 120;
  if (!root.isConnected || root.offsetWidth < LAYOUT_READY_W) {
    return _lastGoodHeight.get(root) ?? 280;
  }
  let h = 0;
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c && c.offsetHeight) h += c.offsetHeight;
  }
  const cs = getComputedStyle(root);
  const gap = parseFloat(cs.rowGap || cs.gap || "0") || 0;
  h += gap * Math.max(0, kids.length - 1);
  h += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  if (h < 20) return _lastGoodHeight.get(root) ?? 280;
  _lastGoodHeight.set(root, h);
  return h;
}

export function buildRoot() {
  const root = document.createElement("div");
  root.className = "z-xy-root";
  root.innerHTML = `
    <div class="z-xy-axis" data-axis="x"></div>
    <div class="z-xy-axis" data-axis="y"></div>
    <div class="z-xy-counter-wrap"></div>
    <div class="z-xy-opts"></div>
    <div class="z-xy-opts2"></div>
    <div class="z-xy-opts3"></div>
    <div class="z-xy-gridmount"></div>`;
  return root;
}

// ── small DOM helpers ──────────────────────────────────────────────────────

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// Keydown isolation so ComfyUI / LiteGraph don't grab Arrow / Enter / Z etc.
function isolate(input) {
  input.addEventListener("keydown", (e) => e.stopImmediatePropagation());
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  return input;
}

function labeledField(label, value, oninput) {
  const wrap = el("div", "z-xy-field");
  wrap.appendChild(el("span", "z-xy-flbl", label));
  const inp = isolate(el("input"));
  inp.type = "text";
  inp.value = value == null ? "" : String(value);
  inp.addEventListener("input", () => oninput(inp.value));
  wrap.appendChild(inp);
  // The whole box looks clickable - so clicking the label or the padding
  // (anywhere but the input itself) focuses the input. preventDefault keeps
  // it from stealing/Collapsing a text selection inside the input.
  wrap.addEventListener("mousedown", (e) => {
    if (e.target !== inp) { e.preventDefault(); inp.focus(); }
  });
  return wrap;
}

// ── target dropdown ─────────────────────────────────────────────────────────

let _openPopup = null;
function closePopup() {
  if (_openPopup) { try { _openPopup._cleanup(); } catch (_e) {} _openPopup.remove(); _openPopup = null; }
}

// Close the picker popup ONLY if it belongs to `node` - so deleting node A
// doesn't tear down node B's open picker (the popup is a module singleton).
export function closePopupIfOwner(node) {
  if (_openPopup && node && _openPopup._pixOwnerId === node.id) closePopup();
}

// Local, zoom-agnostic popup placement: below the anchor, flipped above when
// there isn't room, clamped to the viewport. (Replaces Pixaroma's shared
// zoom-scaled placer; our popup sizes are px, not em.)
function placePopup(popup, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  popup.style.left = Math.max(8, Math.min(r.left, window.innerWidth - popup.offsetWidth - 8)) + "px";
  const h = popup.offsetHeight;
  if (r.bottom + 4 + h <= window.innerHeight - 8) popup.style.top = (r.bottom + 4) + "px";
  else popup.style.top = Math.max(8, r.top - 4 - h) + "px";
}

function flatChoices(node) {
  const out = [];
  for (const t of enumerateTargets(node)) {
    for (const w of t.widgets) out.push({ nodeId: t.nodeId, title: t.title, w });
  }
  return out;
}

function selectChoice(node, axisKey, choice, rerender) {
  const state = readState(node);
  const axis = state[axisKey];
  const sf = choice.w.subField || null;
  const changed = axis.nodeId !== choice.nodeId || axis.widgetName !== choice.w.name || (axis.subField || null) !== sf;
  axis.nodeId = choice.nodeId;
  axis.widgetName = choice.w.name;
  axis.subField = sf;
  // The friendly display name, saved so the grid title and this readout stay readable
  // even if the target node is later deleted (a provider axis's `name` is an internal
  // key). Written only here, on a user pick - it is deliberately absent from
  // emptyAxis(), so backfillAxis can never ADD it on the load path and dirty an older
  // saved workflow (same reasoning as subField, Pattern #11).
  axis.label = (choice.w.label && choice.w.label !== choice.w.name) ? String(choice.w.label) : null;
  axis.widgetType = choice.w.type;
  axis.step = choice.w.step || 1;
  axis.precision = (typeof choice.w.precision === "number") ? choice.w.precision : null;
  axis.realStep = (typeof choice.w.realStep === "number") ? choice.w.realStep : null;
  axis.options = choice.w.type === "combo" ? (choice.w.options || []) : [];
  if (changed) {
    // Reset entry to a sensible default for the new widget type. Mutate the
    // EXISTING raw object IN PLACE - do NOT replace it with a fresh literal, or
    // any value-field handler that captured the old raw by reference would
    // write a stale snapshot and clobber the other axis (the same aliasing bug
    // that readState's backfillAxis was built to prevent).
    axis.mode = choice.w.type === "number" ? "range" : (choice.w.type === "text" ? "fulllist" : null);
    const r = axis.raw || (axis.raw = {});
    r.start = ""; r.end = ""; r.steps = ""; r.listText = "";
    r.checked = []; r.srFind = ""; r.srReplace = "";
  }
  writeState(node, state);
  rerender();
}

function openPicker(node, axisKey, anchorEl, rerender) {
  closePopup();
  const state = readState(node);
  const axis = state[axisKey];
  const targets = enumerateTargets(node);
  const popup = el("div", "z-xy-popup");

  const rows = [];   // { sec, items: [{ el, hay }] }
  let filter = null;
  if (!targets.length) {
    popup.appendChild(el("div", "z-xy-empty", "No other nodes with adjustable settings found. Add a node (e.g. KSampler) and wire your workflow first."));
  } else {
    filter = isolate(el("input", "z-xy-input"));
    filter.type = "text";
    filter.placeholder = "Filter settings…";
    filter.style.cssText += "position:sticky;top:0;margin-bottom:6px;";
    popup.appendChild(filter);
    for (const t of targets) {
      const sec = el("div", "z-xy-pop-section", t.title);
      popup.appendChild(sec);
      const items = [];
      for (const w of t.widgets) {
        const item = el("div", "z-xy-pop-item");
        if (axis.nodeId === t.nodeId && axis.widgetName === w.name && (axis.subField || "lora") === (w.subField || "lora")) item.classList.add("sel");
        const top = el("div", "z-xy-pop-item-top");
        const disp = w.label || w.name;
        top.appendChild(el("span", "z-xy-wname", disp));
        top.appendChild(el("span", "z-xy-wtype", w.type));
        item.appendChild(top);
        // A preview of the current value disambiguates identically-named nodes
        // (e.g. the positive vs negative CLIP Text Encode).
        if (w.cur) item.appendChild(el("div", "z-xy-pop-prev", "= " + w.cur));
        item.addEventListener("click", () => {
          selectChoice(node, axisKey, { nodeId: t.nodeId, title: t.title, w }, rerender);
          closePopup();
        });
        popup.appendChild(item);
        items.push({ el: item, hay: (t.title + " " + disp + " " + (w.cur || "")).toLowerCase() });
      }
      rows.push({ sec, items });
    }
    const applyFilter = (q) => {
      const ql = (q || "").toLowerCase();
      for (const r of rows) {
        let any = false;
        for (const it of r.items) {
          const show = !ql || it.hay.includes(ql);
          it.el.style.display = show ? "" : "none";
          if (show) any = true;
        }
        r.sec.style.display = any ? "" : "none";
      }
    };
    filter.addEventListener("input", () => applyFilter(filter.value));
  }
  document.body.appendChild(popup);
  // Zoom-aware sizing + placement (shared, node UI convention #27): the root
  // font tracks the canvas zoom so the list does not read tiny beside a
  // zoomed-in node, the popup grows to fit its longest row instead of being
  // locked to the anchor's width, and it stays inside the viewport. The helper
  // sets the font BEFORE measuring, which the flip-above branch depends on.
  placePopup(popup, anchorEl);

  const onDown = (e) => { if (!popup.contains(e.target)) closePopup(); };
  const onWheel = (e) => { if (!popup.contains(e.target)) closePopup(); };
  const onKey = (e) => { if (e.key === "Escape") closePopup(); };
  setTimeout(() => {
    // If another picker opened in the same tick, closePopup() already ran THIS
    // popup's _cleanup and _openPopup now points at the newer one - bail so we
    // don't attach orphaned, never-removed global listeners (a real leak that
    // also makes the newer popup dismiss on the next outside click).
    if (_openPopup !== popup) return;
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("wheel", onWheel, true);
    document.addEventListener("keydown", onKey, true);
    try { filter?.focus(); } catch (_e) {}
  }, 0);
  popup._cleanup = () => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("keydown", onKey, true);
  };
  popup._pixOwnerId = node?.id;   // so closePopupIfOwner only closes this node's popup
  _openPopup = popup;
}

function renderPicker(node, axisKey, mountRow, rerender) {
  const state = readState(node);
  const axis = state[axisKey];
  const choices = flatChoices(node);
  const curIdx = choices.findIndex((c) => c.nodeId === axis.nodeId && c.w.name === axis.widgetName && (c.w.subField || "lora") === (axis.subField || "lora"));

  const combo = el("div", "z-xy-combo");
  const val = el("span", "z-xy-val");
  if (axis.nodeId != null && axis.widgetName) {
    const title = choices[curIdx]?.title || ("Node " + axis.nodeId);
    const disp = choices[curIdx]?.w?.label || axisDisplayName(axis, node);
    val.innerHTML = `<span class="z-xy-node">${escapeHtml(title)}</span> · ${escapeHtml(disp)}`;
  } else {
    val.classList.add("placeholder");
    val.textContent = "Pick a setting…";
  }
  combo.appendChild(val);
  combo.appendChild(el("span", "z-xy-car", "▼"));
  combo.addEventListener("click", () => openPicker(node, axisKey, combo, rerender));

  const prev = el("div", "z-xy-nav", "◀");
  const next = el("div", "z-xy-nav", "▶");
  if (choices.length < 2) { prev.classList.add("disabled"); next.classList.add("disabled"); }
  const step = (dir) => {
    if (!choices.length) return;
    let i = curIdx < 0 ? (dir > 0 ? 0 : choices.length - 1) : (curIdx + dir + choices.length) % choices.length;
    selectChoice(node, axisKey, choices[i], rerender);
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  mountRow.appendChild(prev);
  mountRow.appendChild(combo);
  mountRow.appendChild(next);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ── value entry (adaptive) ───────────────────────────────────────────────────

function previewText(axis) {
  const vals = resolveAxisValues(axis);
  if (!vals.length) return null;
  const shown = vals.slice(0, 8).map((v) => String(v));
  const more = vals.length > 8 ? ` … (+${vals.length - 8})` : "";
  return { count: vals.length, text: shown.join(", ") + more };
}

function buildPreview(axis) {
  const p = previewText(axis);
  const box = el("div", "z-xy-preview");
  if (!p) { box.innerHTML = `<span style="color:#777">enter values…</span>`; return box; }
  box.innerHTML = `→ <b>${escapeHtml(p.text)}</b> &nbsp;·&nbsp; ${p.count} value${p.count === 1 ? "" : "s"}`;
  return box;
}

// Release any line-number gutters under `el` before its DOM is thrown away.
// attachLineNumbers installs a ResizeObserver per textarea and a Document holds
// its observers strongly, so wiping innerHTML without this pins the detached
// textarea + wrap + gutter + mirror for the rest of the session. These cards are
// rebuilt on every picker change, mode switch, workflow open and tab switch, so
// it accumulates rather than staying at one.
// Deliberately NOT solved by self-disconnecting on !isConnected inside the
// helper: Nodes 2.0 re-parents the widget root, which momentarily detaches the
// element, and that would kill a live gutter.
export function detachLineGutters(el) {
  if (!el) return;
  el.querySelectorAll("textarea").forEach((t) => {
    try { t._pixLnDetach?.(); } catch (_e) {}
  });
}

function renderValueArea(node, axisKey, mount, refreshCounter, rerender) {
  detachLineGutters(mount);
  mount.innerHTML = "";
  const state = readState(node);
  const axis = state[axisKey];
  if (!axis.widgetType) {
    mount.appendChild(el("div", "z-xy-preview", "Pick a setting above to choose its values."));
    return;
  }
  const save = () => writeState(node, state);
  const refreshPreview = () => {
    const old = mount.querySelector(".z-xy-preview");
    const fresh = buildPreview(axis);
    if (old) old.replaceWith(fresh); else mount.appendChild(fresh);
    refreshCounter();
  };

  if (axis.widgetType === "number") {
    // Keep precision synced with the live widget (0 = integer width/height/steps,
    // 1 = cfg, 2 = denoise) so a reloaded axis rounds correctly even if it was
    // saved before precision was tracked.
    const nmeta = lookupWidgetMeta(node, axis);
    // Same rule as the option list below: the live values drive resolveAxisValues via
    // the non-serialized stash, and the SAVED copy is only refreshed on a user-driven
    // render (writing it on the load path rewrites serialized state and flags an
    // untouched workflow "modified" - it bites an axis saved before `precision` was
    // tracked, whose stored null differs from the live 0).
    //
    // The STASH is written UNCONDITIONALLY - including to null - because it is what
    // resolveAxisValues actually reads. Only stashing when the fresh meta had a number
    // let a RE-POINTED axis keep the previous target's snap step: X on Empty Latent
    // `width` (real step 8), re-pointed to a LoRA strength (no step), silently snapped
    // 0.3 / 0.6 / 0.9 to 0 / 0 / 0 - three identical squares, no warning, and no Snap
    // toggle to undo it. `liveOptions` below was unconditional from the start, which is
    // exactly why it never had this bug; keep these three symmetrical.
    const livePrec = (nmeta && typeof nmeta.precision === "number") ? nmeta.precision : null;
    const liveStep = (nmeta && typeof nmeta.realStep === "number") ? nmeta.realStep : null;
    setLiveAxisMeta(axis, "livePrecision", livePrec);
    setLiveAxisMeta(axis, "liveRealStep", liveStep);
    if (!isGraphLoading()) {
      if (livePrec != null) axis.precision = livePrec;
      if (liveStep != null) axis.realStep = liveStep;
    }
    const seg = el("div", "z-xy-seg");
    const sRange = el("span", null, "Range"); const sList = el("span", null, "List");
    (axis.mode === "list" ? sList : sRange).classList.add("on");
    sRange.addEventListener("click", () => { axis.mode = "range"; save(); rerender(); });
    sList.addEventListener("click", () => { axis.mode = "list"; save(); rerender(); });
    seg.appendChild(sRange); seg.appendChild(sList);
    const modeRow = el("div", "z-xy-moderow");
    modeRow.appendChild(seg);
    // Per-axis Snap toggle - lives in the free space next to Range/List so it
    // adds no node height, and only shows when snapping has an effect (the field's
    // step is coarser than its precision, e.g. width/height snap to /16).
    // Read the EFFECTIVE values, the same ones resolveAxisValues snaps with. Reading the
    // saved copies here meant a workflow saved before realStep was tracked had its values
    // snapped while the toggle to stop it was never drawn - the control was invisible but
    // active.
    const effPrec = (livePrec != null) ? livePrec : axis.precision;
    const effStep = (liveStep != null) ? liveStep : axis.realStep;
    const snapUnit = Math.pow(10, -(effPrec != null ? effPrec : 0));
    if (effStep && effStep > snapUnit + 1e-9) {
      const snapT = buildToggle("Snap", axis.snap !== false, (v) => { axis.snap = v; save(); refreshPreview(); });
      snapT.title = "Round values to this setting's real step (e.g. width to multiples of 16). Off = exact.";
      modeRow.appendChild(snapT);
    }
    mount.appendChild(modeRow);

    if (axis.mode === "list") {
      const inp = isolate(el("input", "z-xy-input"));
      inp.type = "text";
      inp.placeholder = "e.g.  4, 6, 8, 10   (or  4-10 (+2)  /  4-10 [4] )";
      inp.value = axis.raw.listText || "";
      inp.addEventListener("input", () => { axis.raw.listText = inp.value; save(); refreshPreview(); });
      mount.appendChild(inp);
    } else {
      const rangeRow = el("div", "z-xy-range");
      rangeRow.appendChild(labeledField("Start", axis.raw.start, (v) => { axis.raw.start = v; save(); refreshPreview(); }));
      rangeRow.appendChild(labeledField("End", axis.raw.end, (v) => { axis.raw.end = v; save(); refreshPreview(); }));
      rangeRow.appendChild(labeledField("Steps", axis.raw.steps, (v) => { axis.raw.steps = v; save(); refreshPreview(); }));
      mount.appendChild(rangeRow);
    }
    mount.appendChild(buildPreview(axis));

  } else if (axis.widgetType === "combo") {
    const meta = lookupWidgetMeta(node, axis);
    const options = (meta && meta.options && meta.options.length) ? meta.options : (axis.options || []);
    // The refreshed list is SERIALIZED state, so persist it only when this render came
    // from a user action. renderBody also runs on the workflow-load path, and there the
    // live list is routinely a little different from the saved one (a LoRA added, a
    // checkpoint renamed) - writing it then rewrites node.properties on a clean open and
    // flags an untouched workflow "modified" (Vue Compat #18/#19).
    //
    // The live list is stashed unconditionally (non-serialized) because resolveAxisValues
    // filters the user's ticks against it. Gating the FILTER as well as the write was a
    // real bug: the checklist below renders from `options` (live) while the filter read
    // the saved list, so a model installed since the save could be ticked and still not
    // plot - hasPlot went false and Run quietly produced one ordinary image.
    setLiveAxisMeta(axis, "liveOptions", options);
    if (!isGraphLoading()) axis.options = options;
    const checkedSet = new Set(axis.raw.checked || []);
    const countEl = el("div", "z-xy-count");
    const updateCount = () => { countEl.textContent = `${checkedSet.size} selected`; };

    // What the checklist is FOR. Without it the list reads as "which of these do you
    // want loaded", because it shows every sampler / checkpoint / LoRA on the machine
    // and offers multi-select - so ticking two LoRAs looks like asking for both at
    // once rather than for one square each. Reported from the wild ("maybe select 2
    // Loras is stupid"), and it applies to every dropdown axis, not just LoRAs.
    const capt = el("div", "z-xy-listcapt", "Tick the ones to try. Each tick is one square.");
    capt.title = "This is the list of VALUES for this axis. Every tick adds one square to the grid; it does not stack them together.";
    mount.appendChild(capt);

    // Filter box - sampler / scheduler / checkpoint lists can be long.
    const filter = isolate(el("input", "z-xy-input"));
    filter.type = "text";
    filter.placeholder = "Filter…";
    filter.style.marginBottom = "6px";
    const list = el("div", "z-xy-check");

    const buildList = (q) => {
      list.innerHTML = "";
      const ql = (q || "").toLowerCase();
      const shown = options.filter((o) => !ql || o.toLowerCase().includes(ql));
      if (!shown.length) {
        list.appendChild(el("div", "z-xy-empty", options.length ? "No matches." : "This dropdown has no options to list."));
      }
      for (const opt of shown) {
        const item = el("div", "z-xy-item");
        const box = el("div", "z-xy-box");
        if (checkedSet.has(opt)) { box.classList.add("ck"); box.textContent = "✓"; }
        item.appendChild(box);
        item.appendChild(el("span", null, opt));
        item.addEventListener("click", () => {
          if (checkedSet.has(opt)) { checkedSet.delete(opt); box.classList.remove("ck"); box.textContent = ""; }
          else { checkedSet.add(opt); box.classList.add("ck"); box.textContent = "✓"; }
          axis.raw.checked = options.filter((o) => checkedSet.has(o)); // preserve displayed order
          save(); updateCount(); refreshCounter();
        });
        list.appendChild(item);
      }
    };
    filter.addEventListener("input", () => buildList(filter.value));
    if (options.length > 6) mount.appendChild(filter);
    mount.appendChild(list);
    buildList("");
    updateCount();
    mount.appendChild(countEl);

  } else if (axis.widgetType === "text") {
    const seg = el("div", "z-xy-seg");
    const sFull = el("span", null, "Full list"); const sSr = el("span", null, "Find & replace");
    (axis.mode === "sr" ? sSr : sFull).classList.add("on");
    sFull.addEventListener("click", () => { axis.mode = "fulllist"; save(); rerender(); });
    sSr.addEventListener("click", () => { axis.mode = "sr"; save(); rerender(); });
    seg.appendChild(sFull); seg.appendChild(sSr);
    mount.appendChild(seg);

    if (axis.mode === "sr") {
      const find = isolate(el("input", "z-xy-input"));
      find.type = "text"; find.placeholder = "Find (text already in the prompt), e.g.  an apple";
      find.value = axis.raw.srFind || "";
      find.style.marginBottom = "6px";
      find.addEventListener("input", () => { axis.raw.srFind = find.value; save(); refreshPreview(); });
      mount.appendChild(find);
      const rep = isolate(el("textarea", "z-xy-input"));
      rep.placeholder = "Replace with (one per line):\na watermelon\na gun";
      rep.value = axis.raw.srReplace || "";
      rep.addEventListener("input", () => { axis.raw.srReplace = rep.value; save(); refreshPreview(); });
      mount.appendChild(rep);
      // Same one-per-line contract as Full list, so it gets the same gutter.
      // Must run AFTER the box is in the document - the gutter measures it.
    } else {
      const ta = isolate(el("textarea", "z-xy-input"));
      ta.placeholder = "One full value per line";
      ta.value = axis.raw.listText || "";
      ta.addEventListener("input", () => { axis.raw.listText = ta.value; save(); refreshPreview(); });
      mount.appendChild(ta);
      // Numbered lines: with wrapping on, one prompt spans several visual rows,
      // so without numbers you cannot see where the next value starts (the
      // user's other half of the same report). Read-only by construction - the
      // numbers are a sibling element, never part of the textarea's value.
    }
    mount.appendChild(buildPreview(axis));
  }
}

// ── options toggles ──────────────────────────────────────────────────────────

function buildToggle(label, on, onToggle) {
  const t = el("div", "z-xy-toggle");
  const pill = el("div", "z-xy-pill" + (on ? " on" : ""));
  pill.appendChild(el("div", "z-xy-knob"));
  t.appendChild(pill);
  t.appendChild(el("span", null, label));
  t.addEventListener("click", () => {
    const nowOn = !pill.classList.contains("on");
    pill.classList.toggle("on", nowOn);
    onToggle(nowOn);
  });
  return t;
}

const THEMES = [["dark", "Dark"], ["light", "Light"], ["mono", "Mono"]];

// Grid color-theme picker. Switching re-skins the CURRENT grid instantly (the
// cells are cached server-side) via /zeonmkii/api/xy_plot/restyle; if no grid
// exists yet it just stores the choice for the next run.
function buildThemeControl(node, state) {
  const wrap = el("div", "z-xy-themewrap");
  wrap.appendChild(el("span", "z-xy-themelbl", "Grid"));
  const seg = el("div", "z-xy-seg z-xy-themeseg");
  const cur = state.theme || "dark";
  for (const [val, label] of THEMES) {
    const s = el("span", null, label);
    if (cur === val) s.classList.add("on");
    s.title = `Grid background + label style: ${label}`;
    s.addEventListener("click", async () => {
      const st = readState(node);
      if (st.theme === val) return;
      st.theme = val;
      writeState(node, st);
      seg.querySelectorAll("span").forEach((x) => x.classList.remove("on"));
      s.classList.add("on");
      // Instant re-skin of the grid already on screen.
      const last = node._zeonXyLastGrid;
      if (last && last.sessionId) {
        // Token guards rapid theme spam: a stale fetch that resolves late must
        // not overwrite node._zeonXyLastGrid (which Save/Copy/Open act on).
        const rtok = (node._zeonXyRestyleReq = (node._zeonXyRestyleReq || 0) + 1);
        try {
          const resp = await fetch(zeonApiUrl("/zeonmkii/api/xy_plot/restyle"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: last.sessionId, theme: val }),
          });
          if (rtok !== node._zeonXyRestyleReq) return;   // superseded by a newer theme click
          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            if (data.filename) {
              const url = zeonApiUrl(`/view?filename=${encodeURIComponent(data.filename)}&subfolder=&type=temp&t=${Date.now()}`);
              node._zeonXyLastGrid = Object.assign({}, last, { filename: data.filename, url });
              node._zeonXyGrid?.setGrid(url);
            }
          } else if (resp.status === 404) {
            xyToast("This grid's cells were cleared - run the plot again to see the new theme.");
          } else {
            // 405 = the restyle route isn't loaded -> ComfyUI needs a restart.
            xyToast("Theme saved. Restart ComfyUI to preview themes instantly; it applies on your next Run regardless.", "warn");
          }
        } catch (_e) {
          xyToast("Theme saved - it'll apply on your next Run.");
        }
      }
    });
    seg.appendChild(s);
  }
  wrap.appendChild(seg);
  return wrap;
}

const SAVE_SIZES = [["2048", "2048"], ["4096", "4096"], ["8192", "8192"], ["full", "Full"]];

// Save-resolution picker: the size the Save Disk / Save Output buttons export at
// (grid long side, in px). "Full" = native resolution, so a big grid saves large
// instead of being shrunk to the 4096 preview. Default 4096 (matches today). The
// grid is re-assembled at this size only when you click Save, so picking a bigger
// size costs nothing on a normal run. Does NOT change the node's IMAGE output,
// which stays 4096 for downstream speed. Purely a stored choice - no server call.
function buildSaveResControl(node, state) {
  const wrap = el("div", "z-xy-themewrap");
  const lbl = el("span", "z-xy-themelbl", "Save");
  lbl.title = "Resolution the Save Disk / Save Output buttons export at (grid long side, in px). Full = native. The node's own image output stays 4096 for downstream speed.";
  wrap.appendChild(lbl);
  const seg = el("div", "z-xy-seg z-xy-themeseg");
  const cur = state.saveMaxSize || "4096";
  for (const [val, label] of SAVE_SIZES) {
    const s = el("span", null, label);
    if (cur === val) s.classList.add("on");
    s.title = val === "full"
      ? "Export at native (full) resolution - largest file."
      : `Export capped to ${val} px on the long side.`;
    s.addEventListener("click", () => {
      const st = readState(node);
      if ((st.saveMaxSize || "4096") === val) return;
      st.saveMaxSize = val;
      writeState(node, st);
      seg.querySelectorAll("span").forEach((x) => x.classList.remove("on"));
      s.classList.add("on");
    });
    seg.appendChild(s);
  }
  wrap.appendChild(seg);
  return wrap;
}

// ── top-level render ─────────────────────────────────────────────────────────

// Fill (or empty) one axis's heads-up slot. DOM only: it never touches node.size,
// node.properties or a widget, so it cannot flag a workflow modified (#18). The
// no-change early return keeps the pointerenter refresh from churning the DOM on
// every pass over the node.
function fillAxisNote(node, slot, axis, otherAxis) {
  const txt = axisNote(node, axis, otherAxis);
  if (slot.dataset.noteTxt === txt) return;
  slot.dataset.noteTxt = txt;
  slot.innerHTML = "";
  if (!txt) return;
  const note = el("div", "z-xy-axisnote");
  note.appendChild(el("span", "z-xy-axisnote-ic", "⚠"));
  note.appendChild(el("span", null, txt));
  note.title = txt;
  slot.appendChild(note);
}

// Re-read both heads-up lines WITHOUT rebuilding the body. The note reports state
// that lives on ANOTHER node (the LoRA Loader's row toggles), and nothing re-renders
// this node when that node changes - so a warning the user has just acted on would
// sit there telling them to do it again, which is a worse bug than the one the note
// fixes. Wired to pointerenter on the body: free until the cursor arrives, which is
// exactly when the user comes back to look.
export function refreshAxisNotes(node, root) {
  if (!node || !root) return;
  let state;
  try { state = readState(node); } catch (_e) { return; }
  for (const axisKey of ["x", "y"]) {
    const slot = root.querySelector(`.z-xy-axis[data-axis="${axisKey}"] .z-xy-noteslot`);
    if (slot) fillAxisNote(node, slot, state[axisKey], state[axisKey === "x" ? "y" : "x"]);
  }
}

// handlers: { rerender(): full rebuild, growth(): re-measure node height }
export function renderBody(node, root, handlers) {
  const state = readState(node);

  const refreshCounter = () => {
    const wrap = root.querySelector(".z-xy-counter-wrap");
    if (!wrap) return;
    const { cols, rows, total, hasPlot } = computeCounts(readState(node));
    wrap.innerHTML = "";
    const chip = el("div", "z-xy-counter" + (hasPlot ? "" : " muted"));
    chip.textContent = hasPlot
      ? `→ ${total} image${total === 1 ? "" : "s"}  (${cols || 1} × ${rows || 1})`
      : "Pick X and/or Y values to plot";
    wrap.appendChild(chip);
  };

  for (const axisKey of ["x", "y"]) {
    const card = root.querySelector(`.z-xy-axis[data-axis="${axisKey}"]`);
    detachLineGutters(card);   // the value area's textarea lives in here
    card.innerHTML = "";
    const head = el("div", "z-xy-axis-head");
    head.appendChild(el("span", "z-xy-badge", axisKey.toUpperCase()));
    head.appendChild(document.createTextNode(axisKey === "x" ? "across" : "down"));
    head.appendChild(el("span", "z-xy-axis-dir", axisKey === "x" ? "➡ columns" : "⬇ rows"));
    // Right-aligned header cluster: each axis shows its own Reset once a setting
    // is picked. (Node help moved to the selection-toolbar Help button.)
    const headRight = el("div", "z-xy-head-right");
    // Per-axis reset (clears just this axis; the other axis + toggles stay).
    // Only shown once a setting is picked - nothing to reset on an empty axis.
    if (handlers.resetAxis && state[axisKey] && state[axisKey].widgetType) {
      const axReset = el("div", "z-xy-axis-reset");
      axReset.appendChild(el("span", "z-xy-axis-reset-ic", "↺"));
      axReset.appendChild(el("span", null, "Reset " + axisKey.toUpperCase()));
      axReset.title = `Reset the ${axisKey.toUpperCase()} axis only - clears its setting and values. The other axis and your toggles stay.`;
      axReset.addEventListener("click", () => handlers.resetAxis(axisKey));
      headRight.appendChild(axReset);
    }
    if (headRight.children.length) head.appendChild(headRight);
    card.appendChild(head);
    const pickRow = el("div", "z-xy-row");
    card.appendChild(pickRow);
    renderPicker(node, axisKey, pickRow, handlers.rerender);
    // "now: <value>" line so the user sees which setting this axis really
    // points at (e.g. the negative 'watermark, text' vs the positive prompt).
    const curp = currentValuePreview(node, state[axisKey]);
    if (curp) {
      const hint = el("div", "z-xy-curhint", "now: " + curp);
      hint.title = "Current value of the setting this axis points at. If it's not the one you meant, re-pick above.";
      card.appendChild(hint);
    }
    // Anything else on the target node that lands in EVERY square (today: the LoRA
    // Loader's other switched-on rows). Shown here rather than only in the picker
    // popup because the surprise arrives when you look at the finished grid, not
    // when you pick. A stable empty slot, so refreshAxisNotes can update it in
    // place without rebuilding the card (which would drop the filter box's focus
    // and the checklist's scroll position).
    const noteSlot = el("div", "z-xy-noteslot");
    card.appendChild(noteSlot);
    fillAxisNote(node, noteSlot, state[axisKey], state[axisKey === "x" ? "y" : "x"]);
    const valueArea = el("div", "z-xy-valuearea");
    card.appendChild(valueArea);
    renderValueArea(node, axisKey, valueArea, refreshCounter, handlers.rerender);
  }

  refreshCounter();

  const opts = root.querySelector(".z-xy-opts");
  opts.innerHTML = "";
  opts.appendChild(buildToggle("Lock seed", state.lockSeed !== false, (v) => { const s = readState(node); s.lockSeed = v; writeState(node, s); }));
  opts.appendChild(buildToggle("Draw labels", state.drawLabels !== false, (v) => { const s = readState(node); s.drawLabels = v; writeState(node, s); }));
  opts.appendChild(buildToggle("Save cells", state.saveCells === true, (v) => { const s = readState(node); s.saveCells = v; writeState(node, s); }));

  // Second row: grid theme picker on the left, Reset on the right.
  const opts2 = root.querySelector(".z-xy-opts2");
  opts2.innerHTML = "";
  opts2.appendChild(buildThemeControl(node, state));
  if (handlers.reset) {
    const reset = el("div", "z-xy-resetbtn");
    reset.appendChild(el("span", null, "↺"));
    reset.appendChild(el("span", null, "Reset XY"));
    reset.title = "Clear BOTH axes, all selections, and the toggles - back to a fresh node.";
    reset.addEventListener("click", () => handlers.reset());
    opts2.appendChild(reset);
  }

  // Third row: the Save-resolution picker, right above the Save buttons.
  const opts3 = root.querySelector(".z-xy-opts3");
  opts3.innerHTML = "";
  opts3.appendChild(buildSaveResControl(node, state));

  if (handlers.growth) handlers.growth();
}
