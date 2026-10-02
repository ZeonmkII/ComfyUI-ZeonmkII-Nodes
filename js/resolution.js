/**
 * ComfyUI-ZeonmkII-Nodes — Resolution UI (v0.11.5)
 *
 * Boss's spec: Pixaroma-style LINES OF BUTTONS, ours — but HORIZONTAL
 * rows, our crimson chips, and NOTHING else: no dropdowns anywhere.
 *   line 1  ORIENTATION   [Landscape] [Portrait]
 *   line 2  RATIO         family row, swaps with orientation
 *   line 3  BASE          [1024] [1536] [2048]
 *   band    live pixels + megapixels, hue by family
 *
 * Mechanics: the four combo widgets remain the serialized truth (Python
 * side untouched) but are collapsed to zero footprint with the standard
 * computeSize [0,-4] hide. Unlike the LoRA loader's hide, serialization is
 * deliberately NOT touched — every selection survives reloads. The DOM
 * panel uses a CONSTANT getMinHeight (DOM-widget law: never measure) and a
 * one-time spawn size, the proven timer pattern.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Resolution";

const FAMILY_HUES = { Landscape: "#4fb8d8", Portrait: "#e06a9a" };

// mirror of nodes/resolution.py (band display only)
const PRESETS = {
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

/** zero-footprint hide — Pixaroma hideJsonWidget (js/shared/utils.mjs:128)
 *  ported verbatim in technique: hidden + computeSize are NOT enough on
 *  the Vue/Nodes-2.0 body; options.canvasOnly is what actually excludes
 *  the widget from the Vue node render (v0.11.5+ slider lesson). */
function collapse(w) {
    if (!w) return;
    w.hidden = true;
    if (!w._zeonCollapsed) {
        w._zeonOrigCompute = w.computeSize;
        w.computeSize = () => [0, -4];
        w._zeonCollapsed = true;
    }
    if (!w.options) w.options = {};
    w.options.canvasOnly = true;
    const hideEl = () => { const el = w.element || w.inputEl; if (el) el.style.display = "none"; };
    hideEl();
    requestAnimationFrame(hideEl);
}

function shortLabel(opt) {
    return String(opt).split(" ")[0]; // "16:9", "2.35:1", "1024", …
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.Resolution",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const orientW = node.widgets.find((x) => x.name === "orientation");
            const landW = node.widgets.find((x) => x.name === "landscape_ratio");
            const portW = node.widgets.find((x) => x.name === "portrait_ratio");
            const baseW = node.widgets.find((x) => x.name === "base_resolution");
            if (!orientW || !landW || !portW || !baseW) return;
            // re-find by name and re-collapse — the frontend can REPLACE
            // widget objects after nodeCreated (v0.11.5: the numeric base
            // combo came back as a visible slider). Idempotent + repeated.
            const collapseAll = () => {
                for (const name of ["orientation", "landscape_ratio", "portrait_ratio", "base_resolution"]) {
                    collapse(node.widgets.find((x) => x.name === name));
                }
            };
            collapseAll();
            requestAnimationFrame(collapseAll);
            requestAnimationFrame(() => requestAnimationFrame(collapseAll)); // second pass: conversions can land a tick later

            // ── panel: three button lines + band ────────────────────────
            const panel = document.createElement("div");
            panel.style.cssText = "padding:4px 8px 2px 8px;";

            const mkLabel = (txt) => {
                const el = document.createElement("div");
                el.className = "zeon-rowlabel";
                el.textContent = txt;
                panel.appendChild(el);
                return el;
            };
            const mkRow = () => {
                const el = document.createElement("div");
                el.className = "zeon-chiprow";
                panel.appendChild(el);
                return el;
            };
            const mkChip = (row, label, title, onClick) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "zeon-chip";
                b.textContent = label;
                b.title = title;
                b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); sync(); });
                row.appendChild(b);
                return b;
            };

            // line 1 — orientation
            mkLabel("ORIENTATION");
            const orientRow = mkRow();
            const orientChips = {};
            for (const opt of orientW.options.values) {
                orientChips[opt] = mkChip(orientRow, opt, opt, () => { orientW.value = opt; });
            }

            // line 2 — ratio, one line per family (display-swapped)
            const ratioRows = {}, ratioChips = {};
            for (const fam of ["Landscape", "Portrait"]) {
                const famW = fam === "Landscape" ? landW : portW;
                const label = mkLabel(fam.toUpperCase() + " RATIO");
                const row = mkRow();
                ratioRows[fam] = { label, row };
                ratioChips[fam] = {};
                for (const opt of famW.options.values) {
                    ratioChips[fam][opt] = mkChip(row, shortLabel(opt), opt, () => { famW.value = opt; });
                }
            }

            // line 3 — base resolution
            mkLabel("BASE RESOLUTION");
            const baseRow = mkRow();
            const baseChips = {};
            for (const opt of baseW.options.values) {
                baseChips[opt] = mkChip(baseRow, opt, "Base " + opt, () => { baseW.value = opt; });
            }

            // band — live pixels
            const band = document.createElement("div");
            band.className = "zeon-band";
            const hue = document.createElement("span");
            hue.className = "zeon-band-hue";
            const bandText = document.createElement("span");
            band.append(hue, bandText);
            panel.appendChild(band);

            const w = node.addDOMWidget("zeon_res_panel", "panel", panel, {
                serialize: false,
                // CONSTANT (DOM-widget law — never measure)
                getMinHeight: () => 150,
            });
            w.serialize = false;

            // one-time spawn size, proven timer pattern (constants only;
            // v0.11.7: width trimmed — 310 still slightly wide)
            try { node.setSize([280, 184]); } catch (_e) {}

            function sync() {
                const fam = orientW.value === "Portrait" ? "Portrait" : "Landscape";
                for (const f of ["Landscape", "Portrait"]) {
                    ratioRows[f].label.style.display = f === fam ? "" : "none";
                    ratioRows[f].row.style.display = f === fam ? "" : "none";
                }
                const ratioW = fam === "Landscape" ? landW : portW;
                for (const opt of Object.keys(orientChips)) {
                    orientChips[opt].classList.toggle("active", opt === fam);
                }
                for (const f of ["Landscape", "Portrait"]) {
                    const famW = f === "Landscape" ? landW : portW;
                    for (const opt of Object.keys(ratioChips[f])) {
                        ratioChips[f][opt].classList.toggle("active", f === fam && opt === famW.value);
                    }
                }
                for (const opt of Object.keys(baseChips)) {
                    baseChips[opt].classList.toggle("active", opt === baseW.value);
                }
                const base = Number(baseW.value) || 1024;
                const dims = (PRESETS[String(ratioW.value)] || {})[base] || [0, 0];
                hue.style.background = FAMILY_HUES[fam];
                bandText.textContent = dims[0]
                    ? `${dims[0]}×${dims[1]} · ${((dims[0] * dims[1]) / 1e6).toFixed(2)} MP`
                    : "—";
            }

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { collapseAll(); sync(); } catch (_e) {}
                return r;
            };

            sync();
        } catch (err) {
            console.error("[ZeonmkII Resolution] setup error:", err);
        }
    },
});
