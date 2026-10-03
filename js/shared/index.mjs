// ╔═══════════════════════════════════════════════════════════════╗
// ║  ZeonmkII Shared — barrel for the LoRAs Loader UI             ║
// ╚═══════════════════════════════════════════════════════════════╝
// The small slice of ComfyUI-Pixaroma's shared bundle (MIT) this pack
// actually uses: the hidden-widget trio, Nodes 2.0 compat, canvas zoom
// passthrough, node-def refresh signal. Kept tiny on purpose — no suite
// machinery (global accents, help system, sweep registry).

export const BRAND = "#e5484d"; // Zeon crimson

// Hide an internal serialization widget (e.g. the LoraLoaderState STRING the
// graphToPrompt hook writes) in BOTH renderers:
//   hidden + computeSize [0,-4]  → zero footprint in the widget stack
//   options.canvasOnly = true    → out of the Vue body AND the legacy
//                                  Parameters tab (shouldRenderAsVue = !canvasOnly)
export function hideJsonWidget(widgets, widgetName) {
  const w = (widgets || []).find((x) => x.name === widgetName);
  if (w) {
    w.hidden = true;
    w.computeSize = () => [0, -4];
    if (!w.options) w.options = {};
    w.options.canvasOnly = true;
    const hideEl = () => { const el = w.element || w.inputEl; if (el) el.style.display = "none"; };
    hideEl();
    requestAnimationFrame(hideEl);
  }
  return w;
}

export { applyAdaptiveCanvasOnly, isVueNodes } from "./nodes2.mjs";
export { installCanvasZoomPassthrough } from "./canvas_zoom.mjs";
export { onNodeDefsRefresh, installRefreshHook } from "./refresh.mjs";
