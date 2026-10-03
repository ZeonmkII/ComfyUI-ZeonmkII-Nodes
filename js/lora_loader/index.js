// ZeonmkII LoRAs Loader - stack many LoRAs in one node. One DOM widget (Add / All /
// gear + a row per LoRA), fixed MODEL + CLIP inputs and MODEL + CLIP + triggers
// outputs. Works in BOTH renderers.
//
// Architecture mirrors Sizes / Resolution: state on node.properties.loraLoaderState,
// injected into the hidden LoraLoaderState input by the graphToPrompt hook below
// (Vue Compat #9). Info panel, gear panel, dropdown, and row menu live in siblings.

import { app } from "../../../scripts/app.js";
import { hideJsonWidget, applyAdaptiveCanvasOnly, installCanvasZoomPassthrough, onNodeDefsRefresh, installRefreshHook } from "../shared/index.mjs";
import { listLoras, invalidateList, invalidateAllInfo } from "./api.mjs";
import { isVueNodes } from "../shared/nodes2.mjs";
import { isGraphLoading } from "../shared/graph_loading.mjs";
import {
  HIDDEN_INPUT, DEFAULT_STATE,
  readState, loadDefaults, promptState,
} from "./core.mjs";
import { injectCSS, renderNode, contentHeight } from "./render.mjs";
import { attachInteractions } from "./interaction.mjs";
import { openLoraPanel, closeLoraPanelFor } from "./settings.mjs";
import { closeInfoPanelFor } from "./info_panel.mjs";
import { closeLoraDropdown } from "./dropdown.mjs";
import { closeRowMenu } from "./interaction.mjs";
// Side-effect import: registers the XY Plot sweep provider so this node's rows show
// up in the XY picker and can be swept per cell.

const CLASS = "ZeonmkII LoRAs Loader";

// R (Refresh Node Definitions) must reach OUR picker too: drop both session
// caches, re-fetch the list, and repaint every LoRA node so the missing-file
// marks track reality. Fires once per refresh pass (deduped in refresh.mjs),
// and also on WebSocket reconnect - the same moments native combos refresh.
onNodeDefsRefresh(() => {
  invalidateList();
  invalidateAllInfo();
  listLoras().then(() => {
    // Recurse into subgraphs like buildIndex below does - a LoRA node nested in a
    // subgraph must get its missing-marks repainted too, not just top-level ones.
    const walk = (g) => {
      for (const n of (g?._nodes || [])) {
        if ((n.comfyClass === CLASS || n.type === CLASS) && n._pixLlRoot) renderNode(n);
        const sub = n.subgraph || n.graph || n._graph;
        if (sub && sub !== g) walk(sub);
      }
    };
    walk(app.graph);
  });
});
const MIN_W = 300;
const CHROME = 66;      // legacy fallback: title + 2 input + 3 output slot rows
const VUE_CHROME = 96;  // Nodes 2.0 fallback

function widgetH(node) { return contentHeight(readState(node)); }

// The node height that shows every row with no scrollbar. Delegate the chrome
// (title + the input/output slot rows) to LiteGraph's computeSize; fall back to a
// constant estimate only if it's unavailable.
function fitNodeH(node) {
  try {
    const cs = node.computeSize?.();
    if (cs && cs[1] > 0) return Math.round(cs[1]);
  } catch (_e) { /* fall through */ }
  return widgetH(node) + (isVueNodes() ? VUE_CHROME : CHROME);
}

// Auto-fit the node height to its content. USER ACTIONS ONLY (never on the load
// path, or a saved size gets rewritten and a clean workflow opens "modified" -
// Vue Compat #18). Preserves the current width so a manual widen sticks.
function fitToContent(node) {
  if (isGraphLoading()) return;
  const w = Math.max(node.size?.[0] || MIN_W, MIN_W);
  const h = fitNodeH(node);
  if (node.setSize) node.setSize([w, h]);
  else node.size = [w, h];
}

function makeRefresh(node) {
  return (structural) => {
    renderNode(node);
    if (structural) fitToContent(node);
    node.setDirtyCanvas?.(true, true);
  };
}

function setupNode(node) {
  hideJsonWidget(node.widgets, HIDDEN_INPUT); // no-op: the Python input is hidden

  const root = document.createElement("div");
  root.className = "z-ll-root";
  const inner = document.createElement("div");
  inner.className = "z-ll-inner";
  root.appendChild(inner);

  const widget = node.addDOMWidget("loras_ui", "zeonmkii_lora_loader", root, {
    getValue: () => readState(node),
    setValue: () => {},
    getMinHeight: () => widgetH(node),
    getMaxHeight: () => widgetH(node),
    margin: 4,
    serialize: false,
  });
  widget.computeLayoutSize = () => ({ minHeight: widgetH(node), minWidth: 1 });
  applyAdaptiveCanvasOnly(widget);
  // Wheel over the LoRA list must still zoom the canvas (Classic; no-ops in Nodes
  // 2.0). The chips list keeps its own scroll - the helper yields to a scrollable
  // region that still has room to scroll.
  installCanvasZoomPassthrough(root);

  node._pixLlRoot = root;
  node._pixLlInner = inner;

  // Fresh default size (configure() overrides this for a loaded node, Vue Compat #8).
  // Mutate in place rather than replacing the array (Vue may hold a reactive proxy).
  if (!Array.isArray(node.size)) node.size = [336, 0];
  node.size[0] = Math.max(node.size[0] || 0, 336);
  node.size[1] = fitNodeH(node);

  attachInteractions(node, widget.element || root, makeRefresh(node));

  // Defer the first populate past configure() so a restored workflow renders its
  // saved rows, not the default (Vue Compat #8). fitToContent bails on the load path.
  queueMicrotask(() => { renderNode(node); fitToContent(node); });

  // Warm the list so the missing-file marks can show WITHOUT the picker ever being
  // opened (a workflow whose LoRA was renamed on disk should say so on load).
  // Cached after the first node; the repaint is DOM-only, so it can't dirty a
  // freshly loaded workflow (Vue Compat #18).
  listLoras().then(() => { if (node._pixLlRoot) renderNode(node); });
}

app.registerExtension({
  name: "ZeonmkII.LoraLoader",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== CLASS) return;
    if (nodeType.prototype._pixLlPatched) return;
    nodeType.prototype._pixLlPatched = true;

    injectCSS();
    // Core calls node.refreshComboInNode(defs) on every graph node when the user
    // presses R - this wires that signal into the cache invalidation above.
    installRefreshHook(nodeType);

    const _origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const r = _origConfigure?.apply(this, arguments);
      if (this._pixLlRoot) { renderNode(this); fitToContent(this); }
      return r;
    };

    const _origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      // Legacy ONLY: in Nodes 2.0 the rendered size lives in the Vue layout store and
      // getMinHeight/computeLayoutSize already lock the height - clamping node.size
      // here would desync and pop on a workflow-tab switch (Nodes 2.0 resize rule).
      if (!isVueNodes()) {
        if (this.size[0] < MIN_W) this.size[0] = MIN_W;
        this.size[1] = fitNodeH(this);
      }
      if (_origResize) return _origResize.call(this, size);
    };

    // Belt-and-braces for the same clamp (node UI convention #7): onResize does not
    // fire on every legacy resize path, so a grow-then-shrink cycle could otherwise
    // leave the node under MIN_W with the row controls clipped past its right edge.
    // Legacy only, for exactly the reason spelled out on onResize above.
    const _origDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      // MUST also be gated on isGraphLoading(): this is the only width clamp that
      // can run on the LOAD path (onConfigure's fitToContent already bails during a
      // load), and node.size is serialized - so a node saved narrower than MIN_W in
      // Nodes 2.0 and reopened in Classic would be rewritten on the first frame and
      // flag an untouched workflow "modified" (Vue Compat #18).
      if (!isVueNodes() && !isGraphLoading() && this.size[0] < MIN_W) this.size[0] = MIN_W;
      return _origDrawFg?.apply(this, arguments);
    };

    const _origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      closeLoraPanelFor(this);
      closeInfoPanelFor(this);
      closeLoraDropdown(); // transient - also auto-closes on the canvas click that deletes
      closeRowMenu();
      return _origRemoved?.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    if (node.comfyClass !== CLASS) return;
    setupNode(node);
  },

  getNodeMenuItems(node) {
    if (node?.comfyClass !== CLASS) return [];
    return [
      { content: "⚙ LoRA Loader settings", callback: () => openLoraPanel(node, makeRefresh(node)) },
    ];
  },
});

// ── graphToPrompt: inject the per-node state (INJECT ONLY, never prune) ──────
function buildIndex() {
  const index = new Map();
  const visit = (graph, prefix) => {
    if (!graph) return;
    for (const n of graph._nodes || graph.nodes || []) {
      if (!n) continue;
      // Composite id (prefix "" at top level, "5:"-style inside a subgraph) so a
      // subgraph node exact-matches its "5:3" prompt id and can't collide with a
      // top-level node that happens to share the bare id (Load Image Mini fix).
      const cid = String(prefix) + n.id;
      if (n.comfyClass === CLASS || n.type === CLASS) {
        index.set(cid, n);
        // Bare id, FIRST-write-wins (top level visited first) so a subgraph node
        // never clobbers a top-level node's exact-id resolution.
        if (!index.has(String(n.id))) index.set(String(n.id), n);
      }
      const inner = n.subgraph || n.graph || n._graph;
      if (inner && inner !== graph) visit(inner, cid + ":");
    }
  };
  visit(app.graph, "");
  return index;
}
function findNode(index, id) {
  const s = String(id);
  if (index.has(s)) return index.get(s);
  const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : null;
  return tail && index.has(tail) ? index.get(tail) : null;
}

const _origGraphToPrompt_fn = app.graphToPrompt;
const _origGraphToPrompt = (...a) => _origGraphToPrompt_fn.apply(app, a);
app.graphToPrompt = async function (...args) {
  const result = await _origGraphToPrompt(...args);
  try {
    const out = result?.output;
    if (out) {
      let index = null;
      for (const id in out) {
        const entry = out[id];
        if (!entry || entry.class_type !== CLASS) continue;
        if (!index) index = buildIndex();
        entry.inputs = entry.inputs || {};
        const node = findNode(index, id);
        const st = node ? readState(node) : { ...DEFAULT_STATE, ...loadDefaults(), loras: [] };
        entry.inputs[HIDDEN_INPUT] = JSON.stringify(promptState(st));
      }
    }
  } catch (e) {
    console.warn("[ZeonmkII LoRAs Loader] could not inject state:", (e && e.message) || e);
  }
  return result;
};

// The gear in the node selection toolbar opens the same panel the right-click
// entry does. ownMenuItem: this node already adds its own menu line.
