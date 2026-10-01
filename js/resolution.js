/**
 * ComfyUI-ZeonmkII-Nodes — Resolution UI
 *
 * v0.9.0: buttons, not dropdowns (Rock's call after live testing). Two
 * rows of chips — ratio + base — in the spirit of Resolution Pixaroma.
 * The native combo widgets STAY as the serialized source of truth (saved
 * workflows load identically to v0.6.0) but are hidden from view; the
 * chips write their values. The live band survives: pixel result +
 * orientation-family color.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Resolution";
const RATIO_W = "aspect_ratio";
const BASE_W = "base_size";

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

function chip(label, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zeon-chip";
    b.textContent = label;
    if (title) b.title = title;
    return b;
}

function rowLabel(text) {
    const d = document.createElement("div");
    d.className = "zeon-rowlabel";
    d.textContent = text;
    return d;
}

// proven visibility toggle (Character Swap v1/v2): hide via hidden flag +
// type-rename + computeSize collapse, never by touching widget values.
function toggleWidget(widget, show) {
    if (!widget) return;
    if (!widget._zeonOrigType) {
        widget._zeonOrigType = widget.type;
        widget._zeonOrigComputeSize = widget.computeSize;
    }
    widget.hidden = !show;
    widget.type = show ? widget._zeonOrigType : "zeon_hidden";
    widget.computeSize = show ? widget._zeonOrigComputeSize : () => [0, -4];
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

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.Resolution",

    // workflow reload restores combo values AFTER nodeCreated — resync the
    // chip highlighting once configure has settled.
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try { if (typeof this._zeonResSync === "function") this._zeonResSync(); } catch (_e) {}
            return r;
        };
    },

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const ratioW = node.widgets ? node.widgets.find((w) => w.name === RATIO_W) : null;
            const baseW = node.widgets ? node.widgets.find((w) => w.name === BASE_W) : null;
            if (!ratioW || !baseW) return;

            const root = document.createElement("div");

            root.appendChild(rowLabel("RATIO"));
            const ratioRow = document.createElement("div");
            ratioRow.className = "zeon-chiprow";
            const ratioChips = new Map();
            const ratioValues = (ratioW.options && ratioW.options.values) || Object.keys(KREA2_PRESETS);
            for (const v of ratioValues) {
                const c = chip(String(v).split(" ")[0], String(v)); // "16:9 Widescreen" → "16:9"
                c.addEventListener("click", (e) => {
                    e.stopPropagation();
                    ratioW.value = v;
                    sync();
                });
                ratioRow.appendChild(c);
                ratioChips.set(v, c);
            }
            root.appendChild(ratioRow);

            root.appendChild(rowLabel("BASE"));
            const baseRow = document.createElement("div");
            baseRow.className = "zeon-chiprow";
            const baseChips = new Map();
            const baseValues = (baseW.options && baseW.options.values) || ["1024", "1536", "2048"];
            for (const v of baseValues) {
                const c = chip(String(v), `Base ${v}`);
                c.addEventListener("click", (e) => {
                    e.stopPropagation();
                    baseW.value = v;
                    sync();
                });
                baseRow.appendChild(c);
                baseChips.set(String(v), c);
            }
            root.appendChild(baseRow);

            const w = node.addDOMWidget("zeon_res_chips", "res", root, {
                serialize: false,
                getMinHeight: () => 92,
            });
            w.serialize = false;

            const band = makeBand(node);

            function sync() {
                const ratio = String(ratioW.value || "");
                const base = Number(baseW.value);
                for (const [v, c] of ratioChips) c.classList.toggle("active", v === ratio);
                for (const [v, c] of baseChips) c.classList.toggle("active", v === String(baseW.value));
                const dims = (KREA2_PRESETS[ratio] || {})[base];
                if (dims) {
                    band.hue.style.background = familyOf(ratio);
                    band.text.textContent = `→ ${dims[0]} × ${dims[1]} · ${ratio} (${base})`;
                } else {
                    band.hue.style.background = "transparent";
                    band.text.textContent = "→ pick a ratio";
                }
            }
            node._zeonResSync = sync;

            interceptWidgetValue(ratioW, sync);
            interceptWidgetValue(baseW, sync);

            // hide the native dropdowns once the value-restore window has
            // settled (values restore positionally)
            setTimeout(() => {
                try {
                    toggleWidget(ratioW, false);
                    toggleWidget(baseW, false);
                    try { node.setSize([node.size[0], node.computeSize()[1]]); } catch (_e) {}
                } catch (err) {
                    console.error("[ZeonmkII Resolution] hide failed:", err);
                }
            }, 100);

            sync();
        } catch (err) {
            console.error("[ZeonmkII Resolution] setup error:", err);
        }
    },
});
