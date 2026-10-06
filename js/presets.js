// ZeonmkII Presets — corner save/load for the two complex nodes (v0.35.0).
//
// Boss's spec (Oct 3): a small button at the corner (not pushing any existing
// elements away) that saves the node's config under a user-chosen name, and a
// load button that picks it back. Kills backup-clone nodes.
//
// Shape, per the pack's own laws:
// - The node BODY is fully covered by each node's hosted DOM widget, so the
//   only DOM-free canvas zone is the TITLE BAR. The two buttons are drawn on
//   the canvas there (onDrawForeground), hit-tested in onMouseDown — and the
//   right-click menu carries "Save preset… / Load preset…" as the guaranteed
//   path (the same getMenuItems route the Loader's settings entry uses).
// - Save/Load dialogs port interaction.mjs's openRowMenu pattern: fixed-
//   position card on <body>, Escape + outside-pointerdown close, capture-phase
//   listeners attached on a setTimeout(0) guard so a same-tick close can never
//   strand them.
// - WHAT gets saved follows each node's own architecture: the Loader is
//   state-driven (node.properties.loraLoaderState via core.mjs's read/write,
//   normalize() runs on the way back in — the same guard every mutation uses);
//   CharSwap's values live in its native widgets, so its preset is widget
//   values BY NAME — the exact path the v0.3.0 restore guard trusts, and the
//   value interceptors auto-repaint rows/band on every write.
// - All fetches go through zeonApiUrl (hosted-ComfyUI law).
import { app } from "/scripts/app.js";
import { zeonApiUrl } from "./shared/api_url.mjs";
import { isGraphLoading } from "./shared/graph_loading.mjs";
import { readState, writeState } from "./lora_loader/core.mjs";
import { renderNode } from "./lora_loader/render.mjs";

const KINDS = {
  "ZeonmkII LoRAs Loader": "lora_stack",
  "ZeonmkII Character Swap": "charswap",
};
const KIND_LABEL = { lora_stack: "LoRA stack", charswap: "Character Swap" };
const ACCENT = "#A20000";
// v0.35.2 (Boss field report): top-right collided with the output pins' corner
// — buttons now sit CENTERED on the title bar. Ugly but easy to see, his call.
const BTN_W = 18, BTN_H = 18, GAP = 3;

function kindOf(node) {
  return KINDS[node?.comfyClass] || KINDS[node?.type] || null;
}
function nodeReady(node, kind) {
  // Only act on nodes whose UI actually built (loader root / charswap root).
  return kind === "lora_stack" ? !!node._pixLlRoot : !!node._zeonCsRoot;
}

// ── corner buttons (title bar, node-local coords: y 0 = top of title) ──────
function buttonRects(node) {
  const w = node.size?.[0] || 320;
  const x0 = (w - (BTN_W * 2 + GAP)) / 2; // centered pair on the title bar
  return {
    save: [x0, 5, BTN_W, BTN_H],
    load: [x0 + BTN_W + GAP, 5, BTN_W, BTN_H],
  };
}
function inRect(pos, r) {
  return !!pos && pos[0] >= r[0] && pos[0] <= r[0] + r[2] &&
         pos[1] >= r[1] && pos[1] <= r[1] + r[3];
}
function drawCornerButtons(node, ctx) {
  const r = buttonRects(node);
  ctx.save();
  ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [rect, glyph] of [[r.save, "💾"], [r.load, "📂"]]) {
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
    ctx.fillStyle = "#f2f0ee";
    ctx.fillText(glyph, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2 + 0.5);
  }
  ctx.restore();
}

// Where the dialogs appear: the last physical click, tracked globally —
// bulletproof regardless of which event wrapper the canvas hands us.
const _lastPointer = { x: 300, y: 200 };
document.addEventListener("pointerdown", (e) => {
  _lastPointer.x = e.clientX; _lastPointer.y = e.clientY;
}, true);

// ── capture / apply (each node's own state architecture) ───────────────────
function captureState(node, kind) {
  try {
    if (kind === "lora_stack") return readState(node);
    const out = {};
    for (const w of node.widgets || []) {
      if (!w?.name || w.serialize === false) continue;
      out[w.name] = w.value;
    }
    return out;
  } catch (_e) {
    return null;
  }
}
function applyState(node, kind, state) {
  if (kind === "lora_stack") {
    writeState(node, state); // normalize() on the way in — same guard as every mutation
    renderNode(node);
    try {
      const cs = node.computeSize?.();
      if (cs && cs[1] > 0) {
        const w = Math.max(node.size?.[0] || 300, 300);
        if (node.setSize) node.setSize([w, Math.round(cs[1])]);
        else node.size = [w, Math.round(cs[1])];
      }
    } catch (_e) { /* cosmetic fit only */ }
  } else {
    // By-name writes: the value interceptors repaint band + rows, and writing
    // char_count LAST means the final pass is the structural one (rows fit).
    const entries = Object.entries(state);
    entries.sort((a, _b) => (a[0] === "char_count" ? 1 : 0) - (_b0(_b) ? 1 : 0));
    for (const [k, v] of entries) {
      const w = (node.widgets || []).find((x) => x?.name === k);
      if (w) w.value = v;
    }
    node._zeonCSUpdateBand?.();
  }
  node.setDirtyCanvas?.(true, true);
}
function _b0(entry) { return entry[0] === "char_count"; }

// ── dialogs (openRowMenu pattern, ported) ──────────────────────────────────
let _dlg = null;
let _dlgCleanup = null;
function closeDialog() {
  if (_dlgCleanup) { try { _dlgCleanup(); } catch {} }
  _dlgCleanup = null;
  if (_dlg) { try { _dlg.remove(); } catch {} }
  _dlg = null;
}
function injectCSS() {
  if (document.getElementById("z-presets-css")) return;
  const s = document.createElement("style");
  s.id = "z-presets-css";
  s.textContent = `
    .z-presets-card { position:fixed; z-index:10030; width:232px; background:#1b1b1b;
      border:1px solid #303030; border-radius:8px; box-shadow:0 12px 34px rgba(0,0,0,0.65);
      font:12px 'Segoe UI',system-ui,sans-serif; color:#e0e0e0; padding:10px 12px; }
    .z-presets-card .t { font-size:10px; letter-spacing:.8px; color:#9aa0a6; margin-bottom:7px; }
    .z-presets-card input { width:100%; box-sizing:border-box; padding:6px 8px; margin-bottom:8px;
      background:#121316; border:1px solid #303030; border-radius:6px; color:#e8e6e3;
      font:12px 'Segoe UI',sans-serif; }
    .z-presets-card input:focus { outline:none; border-color:${ACCENT}; }
    .z-presets-card .row { display:flex; gap:6px; }
    .z-presets-card button { flex:1 1 0; min-width:0; padding:6px 8px; border-radius:6px; cursor:pointer;
      border:1px solid #303030; background:#1a1c20; color:#e0e0e0; font:12px 'Segoe UI',sans-serif; }
    .z-presets-card button.primary { background:${ACCENT}; border-color:${ACCENT}; color:#fff; }
    .z-presets-card button:hover { filter:brightness(1.18); }
    .z-presets-menu { position:fixed; z-index:10030; width:210px; background:#1b1b1b;
      border:1px solid #303030; border-radius:8px; box-shadow:0 12px 34px rgba(0,0,0,0.65);
      font:12px 'Segoe UI',system-ui,sans-serif; color:#e0e0e0; padding:3px 0; }
    .z-presets-menu .it { display:flex; align-items:center; gap:8px; padding:7px 12px; cursor:pointer; }
    .z-presets-menu .it:hover { background:${ACCENT}; color:#fff; }
    .z-presets-menu .it .mt { margin-left:auto; color:#8a8a8a; font-size:10px; }
    .z-presets-menu .it:hover .mt { color:#ffd9d9; }
    .z-presets-menu .none { padding:9px 12px; color:#9aa0a6; font-style:italic; }
    .z-presets-toast { position:fixed; right:14px; bottom:14px; z-index:10040; background:#1b1b1b;
      border-left:3px solid ${ACCENT}; color:#e8e6e3; border-radius:6px; padding:8px 12px;
      font:12px 'Segoe UI',sans-serif; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
  `;
  document.head.appendChild(s);
}
function mountAt(el) {
  document.body.appendChild(el);
  const mw = el.offsetWidth || 220, mh = el.offsetHeight || 120;
  el.style.left = Math.max(6, Math.min(_lastPointer.x, window.innerWidth - mw - 6)) + "px";
  el.style.top = Math.max(6, Math.min(_lastPointer.y - 10, window.innerHeight - mh - 6)) + "px";
  const onDown = (ev) => { if (!el.contains(ev.target)) closeDialog(); };
  const onKey = (ev) => { if (ev.key === "Escape") closeDialog(); };
  _dlg = el; // set BEFORE the timer so a same-tick close can see it (row-menu law)
  setTimeout(() => {
    if (_dlg !== el) return; // closed/replaced already — never strand capture listeners
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  _dlgCleanup = () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  };
}
function toast(msg) {
  injectCSS();
  const el = document.createElement("div");
  el.className = "z-presets-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 350);
  }, 2600);
}
function ago(ts) {
  const s = Math.max(0, (Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// ── flows ───────────────────────────────────────────────────────────────────
function presetSaveFlow(node) {
  const kind = kindOf(node);
  if (!kind || !nodeReady(node, kind)) { toast("Node not ready yet — try again in a second."); return; }
  closeDialog();
  injectCSS();
  const lastKey = "zeonmkii.preset.last." + kind;
  const card = document.createElement("div");
  card.className = "z-presets-card";
  const t = document.createElement("div");
  t.className = "t";
  t.textContent = "SAVE PRESET — " + (KIND_LABEL[kind] || kind);
  const input = document.createElement("input");
  input.maxLength = 64;
  input.placeholder = "preset name";
  try { input.value = localStorage.getItem(lastKey) || ""; } catch {}
  const row = document.createElement("div");
  row.className = "row";
  const bCancel = document.createElement("button");
  bCancel.textContent = "Cancel";
  bCancel.addEventListener("click", closeDialog);
  const bSave = document.createElement("button");
  bSave.className = "primary";
  bSave.textContent = "Save";
  const doSave = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const state = captureState(node, kind);
    if (!state) { toast("Nothing to capture from this node."); return; }
    bSave.disabled = true;
    bSave.textContent = "Saving…";
    fetch(zeonApiUrl(`/zeonmkii/api/presets/${kind}/save`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, state }),
    }).then((r) => r.json()).then((j) => {
      if (j?.ok) {
        try { localStorage.setItem(lastKey, j.name); } catch {}
        closeDialog();
        toast(`Saved “${j.name}”`);
      } else {
        bSave.disabled = false;
        bSave.textContent = "Save";
        toast(j?.message || "Could not save.");
      }
    }).catch(() => {
      bSave.disabled = false;
      bSave.textContent = "Save";
      toast("Save failed — is the server up?");
    });
  };
  bSave.addEventListener("click", doSave);
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); doSave(); }
    if (ev.key === "Escape") { ev.preventDefault(); closeDialog(); }
  });
  row.append(bCancel, bSave);
  card.append(t, input, row);
  mountAt(card);
  input.focus();
  input.select();
}

async function presetLoadFlow(node) {
  const kind = kindOf(node);
  if (!kind || !nodeReady(node, kind)) { toast("Node not ready yet — try again in a second."); return; }
  closeDialog();
  injectCSS();
  let j = null;
  try {
    j = await fetch(zeonApiUrl(`/zeonmkii/api/presets/${kind}/list`)).then((r) => r.json());
  } catch {}
  if (!j?.ok) { toast(j?.message || "Could not read the preset list."); return; }
  const menu = document.createElement("div");
  menu.className = "z-presets-menu";
  if (!j.presets.length) {
    const none = document.createElement("div");
    none.className = "none";
    none.textContent = "No presets yet — save one first.";
    menu.appendChild(none);
  } else {
    for (const p of j.presets.slice(0, 24)) {
      const it = document.createElement("div");
      it.className = "it";
      const nm = document.createElement("span");
      nm.textContent = p.name;
      const mt = document.createElement("span");
      mt.className = "mt";
      mt.textContent = ago(p.mtime || 0);
      it.append(nm, mt);
      it.addEventListener("click", async () => {
        closeDialog();
        let g = null;
        try {
          g = await fetch(zeonApiUrl(`/zeonmkii/api/presets/${kind}/get?name=${encodeURIComponent(p.name)}`))
            .then((r) => r.json());
        } catch {}
        if (!g?.ok) { toast(g?.message || "Could not load that preset."); return; }
        try {
          applyState(node, kind, g.state);
          toast(`Loaded “${g.name || p.name}”`);
        } catch (_e) {
          toast("Could not apply that preset.");
        }
      });
      menu.appendChild(it);
    }
  }
  mountAt(menu);
}

// ── wiring ──────────────────────────────────────────────────────────────────
function patchNodeType(nodeType) {
  if (nodeType.prototype._zeonPresetPatched) return;
  nodeType.prototype._zeonPresetPatched = true;

  const _origDraw = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    const r = _origDraw?.apply(this, arguments);
    try { drawCornerButtons(this, ctx); } catch {}
    return r;
  };

  const _origDown = nodeType.prototype.onMouseDown;
  nodeType.prototype.onMouseDown = function (e, pos) {
    try {
      if (!isGraphLoading() && kindOf(this)) {
        const r = buttonRects(this);
        if (inRect(pos, r.save)) { presetSaveFlow(this); return true; }
        if (inRect(pos, r.load)) { presetLoadFlow(this); return true; }
      }
    } catch {}
    return _origDown?.apply(this, arguments);
  };
}

app.registerExtension({
  name: "ZeonmkII.Presets",
  setup() {
    console.info("[zeonmkii] presets online v0.35.2 (loader + charswap)");
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (!KINDS[nodeData?.name]) return;
    patchNodeType(nodeType);
  },
  getNodeMenuItems(node) {
    const kind = kindOf(node);
    if (!kind) return [];
    return [
      { content: "💾 Save preset…", callback: () => presetSaveFlow(node) },
      { content: "📂 Load preset…", callback: () => presetLoadFlow(node) },
    ];
  },
});
