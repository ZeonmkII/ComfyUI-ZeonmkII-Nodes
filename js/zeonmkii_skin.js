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
.zeon-clock {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 24px; line-height: 1.2; text-align: center;
  padding: 6px 10px 2px 10px; color: ${ZEON.TEXT};
}
.zeon-clock.status-running { color: ${ZEON.ACCENT}; }
.zeon-clock.status-done { color: #5fbf6e; }
.zeon-clock.status-error { color: #e5484d; }
.zeon-clock-status {
  font-size: 10px; color: #9aa0a6; text-align: center;
  padding-bottom: 6px; letter-spacing: 0.5px;
}
.zeon-note { padding: 2px 10px 8px 10px; font-size: 12px; line-height: 1.5; color: ${ZEON.TEXT}; overflow-wrap: anywhere; }
.zeon-note h1, .zeon-note h2, .zeon-note h3 { color: #ffffff; margin: 6px 0 3px 0; line-height: 1.25; }
.zeon-note h1 { font-size: 15px; }
.zeon-note h2 { font-size: 13.5px; border-bottom: 1px solid ${ZEON.ACCENT_DIM}; padding-bottom: 2px; }
.zeon-note h3 { font-size: 12.5px; }
.zeon-note p { margin: 3px 0; }
.zeon-note ul, .zeon-note ol { margin: 3px 0 3px 18px; padding: 0; }
.zeon-note li { margin: 1px 0; }
.zeon-note code { background: ${ZEON.PANEL}; border-radius: 4px; padding: 0 4px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
.zeon-note a { color: #4fb8d8; text-decoration: none; }
.zeon-note a:hover { text-decoration: underline; }
.zeon-note hr { border: none; border-top: 1px dashed ${ZEON.ACCENT_DIM}; margin: 6px 0; }
.zeon-note-table { border-collapse: collapse; margin: 5px 0; }
.zeon-note-table th { background: ${ZEON.PANEL}; color: #ffffff; text-align: left; padding: 2px 8px; border: 1px solid #3a3f46; font-size: 11px; }
.zeon-note-table td { padding: 2px 8px; border: 1px solid #3a3f46; }
.zeon-note-empty { color: #9aa0a6; font-style: italic; }
.zeon-rowlabel { font-size: 9px; color: #9aa0a6; letter-spacing: 1.2px; padding: 3px 0 0 2px; }
.zeon-chiprow { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0 4px 0; }
.zeon-chip {
  padding: 3px 8px; border: 1px solid #3a3f46; border-radius: 10px;
  background: ${ZEON.PANEL}; color: ${ZEON.TEXT}; font-size: 11px; cursor: pointer;
  user-select: none; white-space: nowrap;
}
.zeon-chip:hover { border-color: ${ZEON.ACCENT_DIM}; color: #fff; }
.zeon-chip.active { background: ${ZEON.ACCENT}; border-color: ${ZEON.ACCENT}; color: #fff; }
.zeon-preview {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px; color: #9aa0a6; padding: 2px 8px 6px 8px;
  overflow-wrap: anywhere;
}
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
  const w = node.addDOMWidget("zeon_toolbar_" + Math.random().toString(36).slice(2, 7), "toolbar", root, {
    serialize: false,
    getMinHeight: () => 34,
  });
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
  const w = node.addDOMWidget("zeon_band_" + Math.random().toString(36).slice(2, 7), "band", el, {
    serialize: false,
    getMinHeight: () => 26,
  });
  w.serialize = false;
  return { el, hue, text };
}

export function applyNodeSkin(node) {
  node.color = ZEON.ACCENT;
  node.bgcolor = ZEON.BODY;
}
