/**
 * ComfyUI-ZeonmkII-Nodes — shared skin module
 *
 * Single source of the pack's look: Zeon palette, one injected stylesheet,
 * and factories for the toolbar / selection band. Every skinned node imports
 * from here, so the whole pack restyles from ONE file.
 *
 * Style language cribbed from Pixaroma's proven approach: plain DOM buttons
 * with scoped classes + a stylesheet appended to document.head once.
 */

export const ZEON = {
  ACCENT: "#e5484d",      // Zeon crimson
  ACCENT_DIM: "#b83a3e",
  BODY: "#1f2226",        // node body
  PANEL: "#2a2e34",       // raised areas
  TEXT: "#e8e6e3",
  // per-slot identity colors, 8 slots
  SLOT_HUES: ["#e5484d", "#e88b3a", "#d8b13a", "#5fbf6e", "#4fb8d8", "#7a7af0", "#c76ad0", "#e06a9a"],
};

const STYLE_ID = "zeonmkii-skin-styles";

export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.zeon-toolbar { display:flex; gap:6px; padding:2px 0 4px 0; }
.zeon-btn {
  flex:1 1 auto; padding:4px 8px; border:1px solid ${ZEON.ACCENT_DIM};
  border-radius:6px; background:${ZEON.PANEL}; color:${ZEON.TEXT};
  font-size:12px; cursor:pointer;
}
.zeon-btn:hover { background:${ZEON.ACCENT_DIM}; color:#fff; }
.zeon-btn:active { background:${ZEON.ACCENT}; border-color:${ZEON.ACCENT}; color:#fff; }
.zeon-band {
  display:flex; align-items:center; gap:6px; padding:3px 8px; margin-top:4px;
  border-radius:6px; background:${ZEON.BODY}; border-left:3px solid ${ZEON.ACCENT};
  color:${ZEON.TEXT}; font-size:11px; min-height:18px;
}
.zeon-band .zeon-band-hue { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
`;
  document.head.appendChild(style);
}

/**
 * Add a toolbar DOM widget (bottom of node) with styled buttons.
 * buttons: [{label, title?, onClick(btn), active?}]
 * All toolbar widgets are serialize:false — they never touch saved values.
 */
export function makeToolbar(node, buttons) {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "zeon-toolbar";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zeon-btn";
    btn.textContent = b.label;
    if (b.title) btn.title = b.title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      b.onClick(btn);
    });
    root.appendChild(btn);
  }
  const w = node.addDOMWidget("zeon_toolbar_" + Math.random().toString(36).slice(2, 7), "toolbar", root, {});
  w.serialize = false;
  return root;
}

/**
 * Add the selection band DOM widget: colored dot + status text.
 * Returns {hue, text} element handles for live updates.
 */
export function makeBand(node) {
  ensureStyles();
  const el = document.createElement("div");
  el.className = "zeon-band";
  const hue = document.createElement("span");
  hue.className = "zeon-band-hue";
  const text = document.createElement("span");
  el.appendChild(hue);
  el.appendChild(text);
  const w = node.addDOMWidget("zeon_band_" + Math.random().toString(36).slice(2, 7), "band", el, {});
  w.serialize = false;
  return { el, hue, text };
}

export function applyNodeSkin(node) {
  node.color = ZEON.ACCENT;
  node.bgcolor = ZEON.BODY;
}
