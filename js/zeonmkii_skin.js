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

import { app } from "/scripts/app.js";  // absolute — pack convention (relative depth 404s silently)

export const ZEON = {
  ACCENT: "#A20000",      // Zeon crimson
  ACCENT_DIM: "#750000",
  BODY: "#121316",        // node body
  PANEL: "#1a1c20",       // raised areas
  TEXT: "#e8e6e3",
  // per-slot identity colors, 8 slots
  SLOT_HUES: ["#A20000", "#e88b3a", "#d8b13a", "#5fbf6e", "#4fb8d8", "#7a7af0", "#c76ad0", "#e06a9a"],
};

const STYLE_ID = "zeonmkii-skin-styles";
const FONT_ID = "zeonmkii-orbitron-font";

export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  // CRT-grade digits want Orbitron; fall back to monospace offline
  if (!document.getElementById(FONT_ID)) {
    const link = document.createElement("link");
    link.id = FONT_ID;
    link.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.zeon-toolbar { display:flex; gap:6px; padding:2px 0 4px 0; width:100%; box-sizing:border-box; }
.zeon-btn {
  flex:1 1 0; min-width:0; padding:4px 8px; border:1px solid ${ZEON.ACCENT_DIM};
  border-radius:6px; background:${ZEON.PANEL}; color:${ZEON.TEXT};
  font-size:12px; cursor:pointer;
  text-align:center; box-sizing:border-box;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.zeon-btn:hover { background:${ZEON.ACCENT_DIM}; color:#fff; }
.zeon-btn:active { background:${ZEON.ACCENT}; border-color:${ZEON.ACCENT}; color:#fff; }
.zeon-band {
  display:flex; align-items:center; gap:6px; padding:3px 8px; margin-top:4px;
  border-radius:6px; background:${ZEON.BODY}; border-left:3px solid ${ZEON.ACCENT};
  color:${ZEON.TEXT}; font-size:11px; min-height:18px;
  white-space: pre-wrap;  /* v0.25.1: multi-line previews keep their newlines */
}
.zeon-band .zeon-band-hue { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
.zeon-timer-root { width: 100%; height: 100%; position: relative; }
.zeon-clock {
  font-family: 'Orbitron', ui-monospace, Menlo, Consolas, monospace;
  font-size: 50px; font-weight: bold;
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: ${ZEON.TEXT};
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
/* glow lives ONLY on running (and matches its own color) — done is clean
   white, error red w/ red glow; no more green-with-red-shadow clash */
.zeon-clock.status-running { color: ${ZEON.ACCENT}; animation: zeon-glow 2s infinite ease-in-out; }
@keyframes zeon-glow {
  0%, 100% { text-shadow: 0 0 16px rgba(162,0,0, 0.45); }
  50% { text-shadow: 0 0 30px rgba(162,0,0, 0.7); }
}
.zeon-clock.status-done { color: #ffffff; text-shadow: none; }
.zeon-clock.status-error { color: #A20000; text-shadow: 0 0 14px rgba(162,0,0, 0.5); }
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
.zeon-note-table th { background: ${ZEON.PANEL}; color: #ffffff; text-align: left; padding: 2px 8px; border: 1px solid #232529; font-size: 11px; }
.zeon-note-table td { padding: 2px 8px; border: 1px solid #232529; }
.zeon-note-empty { color: #9aa0a6; font-style: italic; }
.zeon-rowlabel { font-size: 9px; color: #9aa0a6; letter-spacing: 1.2px; padding: 3px 0 0 2px; }
.zeon-chiprow { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0 4px 0; }
.zeon-chip {
  padding: 3px 8px; border: 1px solid #232529; border-radius: 10px;
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

// ── Pack-wide skin enforcement ─────────────────────────────────────────
// LiteGraph serializes node.color/bgcolor INTO saved workflows and reapplies
// them when a graph is configured — AFTER every nodeCreated hook has run. So
// nodes loaded from an older workflow arrived wearing their baked colors
// (navy body, old/default title), silently clobbering the paint. This
// extension re-asserts the pack skin once configuration is done, so every
// ZeonmkII node is blood-red / near-black on EVERY load, saved workflows
// included. Manual recolors of our nodes do not survive a reload — the pack
// is uniform by design.

const ZEON_CLASSES = new Set([
  "ZeonmkII Character Swap",
  "ZeonmkII LoRAs Loader",
  "ZeonmkII XY Plot",
  "Load Random Image ZeonmkII",
  "Load Random Prompt ZeonmkII",
  "ZeonmkII Global Seed",
  "ZeonmkII Wildcard Expand",
  "ZeonmkII ANY to STRING",
  "ZeonmkII Model Name",
  "ZeonmkII Input Watcher",
  "ZeonmkII Read Metadata",
  "ZeonmkII Pipe In",
  "ZeonmkII Pipe Out",
  "ZeonmkII Pipe Edit",
  "ZeonmkII Pipe Init",
  "ZeonmkII Pipe Insert",
  "ZeonmkII String",
  "ZeonmkII String Composer",
  "ZeonmkII INT",
  "ZeonmkII FLOAT",
  "ZeonmkII Sampler Selector",
  "ZeonmkII Scheduler Selector",
  "ZeonmkII Resolution",
  "ZeonmkII Run Timer",
  "ZeonmkII Save Image",
]);

function walkZeonNodes(graph, fn) {
  if (!graph) return;
  for (const n of graph._nodes || graph.nodes || []) {
    if (!n) continue;
    if (ZEON_CLASSES.has(n.comfyClass)) fn(n);
    if (n.subgraph) walkZeonNodes(n.subgraph, fn);  // subgraph nodes too
  }
}

app.registerExtension({
  name: "ComfyUI-ZeonmkII-Nodes.Skin",
  setup() {
    console.info("[zeonmkii] skin online v0.15.6 (INT/FLOAT/selectors added)");
  },
  nodeCreated(node) {
    if (!ZEON_CLASSES.has(node.comfyClass)) return;
    applyNodeSkin(node);
    // Post-creation re-assert (v0.15.5): a frontend pass reapplies default
    // node colors AFTER nodeCreated on some nodes (observed on Resolution:
    // paint applied, then reset to palette defaults with no pack code
    // involved — hex absent from repo and history). Repaint on the next
    // frames/ticks and REPORT any fight, so the console tells us the
    // clobberer's timing instead of us guessing.
    const reassert = (when) => () => {
      if (!node.graph) return; // node was deleted meanwhile
      if (node.color !== ZEON.ACCENT || node.bgcolor !== ZEON.BODY) {
        console.warn(
          `[zeonmkii] skin re-asserted on ${node.comfyClass} at +${when} ` +
          `(was color=${node.color} bg=${node.bgcolor})`
        );
        applyNodeSkin(node);
      }
    };
    requestAnimationFrame(reassert("frame"));
    setTimeout(reassert("250ms"), 250);
    setTimeout(reassert("1s"), 1000);
  },
  onGraphConfigured() {
    walkZeonNodes(app.graph, applyNodeSkin);
  },
});
