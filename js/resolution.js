/**
 * ComfyUI-ZeonmkII-Nodes — Resolution UI
 *
 * Skin only: crimson node + a live band showing the pixel result of the
 * current ratio/base pick, color-coded by orientation family
 * (blue = landscape, yellow = square, pink = portrait).
 * All values live in nodes/resolution.py.
 */
import { app } from "/scripts/app.js";
import { applyNodeSkin, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Resolution";

const FAMILY_HUES = {
    landscape: "#4fb8d8", // wide family: 4:3, 3:2, 16:9, 2.35:1
    square: "#d8b13a",    // 1:1
    portrait: "#e06a9a",  // tall family: 4:5, 3:4, 2:3, 9:16
};

function familyOf(ratio) {
    if (ratio.startsWith("1:1")) return FAMILY_HUES.square;
    if (ratio.includes("Landscape") || ratio.includes("Widescreen") || ratio.includes("Cinematic")) return FAMILY_HUES.landscape;
    return FAMILY_HUES.portrait;
}

function interceptWidgetValue(widget, onChange) {
    let widgetValue = widget.value;
    const desc =
        Object.getOwnPropertyDescriptor(widget, "value") ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(widget), "value");
    Object.defineProperty(widget, "value", {
        configurable: true,
        enumerable: true,
        get() { return desc && desc.get ? desc.get.call(widget) : widgetValue; },
        set(newVal) {
            if (desc && desc.set) desc.set.call(widget, newVal);
            else widgetValue = newVal;
            onChange(newVal);
        },
    });
}

// pixel table mirrored from nodes/resolution.py for the live band readout
const KREA2_PRESETS = {
    "1:1 Square": { 1024: [1024, 1024], 1536: [1536, 1536], 2048: [2048, 2048] },
    "4:3 Landscape": { 1024: [1184, 896], 1536: [1776, 1344], 2048: [2368, 1792] },
    "3:2 Landscape": { 1024: [1248, 832], 1536: [1872, 1248], 2048: [2496, 1664] },
    "16:9 Widescreen": { 1024: [1376, 768], 1536: [2064, 1152], 2048: [2752, 1536] },
    "2.35:1 Cinematic": { 1024: [1568, 672], 1536: [2352, 1008], 2048: [3136, 1344] },
    "4:5 Portrait": { 1024: [928, 1152], 1536: [1392, 1728], 2048: [1856, 2304] },
    "3:4 Portrait": { 1024: [896, 1184], 1536: [1344, 1776], 2048: [1792, 2368] },
    "2:3 Portrait": { 1024: [832, 1248], 1536: [1248, 1872], 2048: [1664, 2496] },
    "9:16 Portrait": { 1024: [768, 1376], 1536: [1152, 2064], 2048: [1536, 2752] },
};

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.Resolution",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        applyNodeSkin(node);
        const band = makeBand(node);

        function update() {
            const ratioW = node.widgets ? node.widgets.find((w) => w.name === "aspect_ratio") : null;
            const baseW = node.widgets ? node.widgets.find((w) => w.name === "base_size") : null;
            const ratio = ratioW ? ratioW.value : "";
            const base = baseW ? Number(baseW.value) : 1024;
            const dims = (KREA2_PRESETS[ratio] || {})[base];
            if (dims) {
                band.hue.style.background = familyOf(ratio);
                band.text.textContent = `→ ${dims[0]} × ${dims[1]} · ${ratio} (${base})`;
            } else {
                band.hue.style.background = "transparent";
                band.text.textContent = "→ pick a ratio";
            }
        }

        for (const w of node.widgets || []) {
            if (w.name === "aspect_ratio" || w.name === "base_size") interceptWidgetValue(w, update);
        }
        setTimeout(update, 50); // first paint after widgets settle
    },
});
