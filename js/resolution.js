/**
 * ComfyUI-ZeonmkII-Nodes — Resolution UI (v0.11.0)
 *
 * Skin: crimson node + chip-button rows for the ACTIVE orientation family
 * (Landscape / Portrait, Square shared), plus a live pixel band colored by
 * family. The inactive family's dropdown hides with the real zero-footprint
 * mechanic, so the node shrinks honestly. All values live in resolution.py.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Resolution";

const FAMILY_HUES = { Landscape: "#4fb8d8", Portrait: "#e06a9a" };

function setWidgetHidden(widget, hidden) {
    if (!widget) return;
    if (hidden) {
        if (!widget._zeonOrig) {
            widget._zeonOrig = { computeSize: widget.computeSize, serializeValue: widget.serializeValue };
        }
        widget.computeSize = () => [0, -4];
        widget.serializeValue = () => null;
        widget._zeonHidden = true;
    } else if (widget._zeonHidden) {
        if (widget._zeonOrig.computeSize) widget.computeSize = widget._zeonOrig.computeSize;
        else delete widget.computeSize;
        if (widget._zeonOrig.serializeValue) widget.serializeValue = widget._zeonOrig.serializeValue;
        else delete widget.serializeValue;
        widget._zeonHidden = false;
    }
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

            const band = makeBand(node);

            // chip rows: one per family
            const root = document.createElement("div");
            root.style.cssText = "padding:3px 8px 2px 8px;";
            const rows = {};
            const chipMap = {};
            for (const fam of ["Landscape", "Portrait"]) {
                const label = document.createElement("div");
                label.className = "zeon-rowlabel";
                label.textContent = fam.toUpperCase() + " RATIOS";
                const row = document.createElement("div");
                row.className = "zeon-chiprow";
                root.append(label, row);
                rows[fam] = { label, row, chips: [] };
            }
            const comboFor = (fam) => (fam === "Landscape" ? landW : portW);
            for (const fam of ["Landscape", "Portrait"]) {
                const w = comboFor(fam);
                for (const opt of w.options.values) {
                    const chip = document.createElement("button");
                    chip.type = "button";
                    chip.className = "zeon-chip";
                    chip.textContent = opt.split(" ")[0]; // "16:9", "2.35:1", …
                    chip.title = opt;
                    chip.addEventListener("click", (e) => {
                        e.stopPropagation();
                        orientW.value = fam;
                        w.value = opt;
                        sync();
                    });
                    rows[fam].row.appendChild(chip);
                    rows[fam].chips.push({ chip, opt });
                    chipMap[fam + "|" + opt] = chip;
                }
            }

            const panelW = node.addDOMWidget("zeon_res_chips", "chips", root, {
                serialize: false,
                getMinHeight: () => 96,
            });
            panelW.serialize = false;
            const idx = node.widgets.indexOf(orientW);
            if (idx >= 0) {
                node.widgets.splice(node.widgets.indexOf(panelW), 1);
                node.widgets.splice(idx, 0, panelW);
            }

            function dimsFor(fam, ratio) {
                // mirror of the python table, for the live band only
                const T = {
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
                const b = Number(baseW.value) || 1024;
                return (T[ratio] && T[ratio][b]) || [0, 0];
            }

            function sync() {
                const fam = orientW.value === "Portrait" ? "Portrait" : "Landscape";
                // hide the inactive family's combo + row with real mechanics
                setWidgetHidden(landW, fam !== "Landscape");
                setWidgetHidden(portW, fam !== "Portrait");
                rows.Landscape.label.style.display = fam === "Landscape" ? "" : "none";
                rows.Landscape.row.style.display = fam === "Landscape" ? "" : "none";
                rows.Portrait.label.style.display = fam === "Portrait" ? "" : "none";
                rows.Portrait.row.style.display = fam === "Portrait" ? "" : "none";

                const activeW = comboFor(fam);
                band.hue.style.background = FAMILY_HUES[fam];
                for (const fam2 of ["Landscape", "Portrait"]) {
                    const cur = comboFor(fam2).value;
                    for (const { chip, opt } of rows[fam2].chips) {
                        chip.classList.toggle("active", fam2 === fam && opt === cur);
                    }
                }
                const [w2, h2] = dimsFor(fam, String(activeW.value));
                const mp = w2 && h2 ? ((w2 * h2) / 1e6).toFixed(2) : "?";
                band.text.textContent = `${w2} × ${h2} · ${mp} MP · ${activeW.value} @ base ${baseW.value}`;
                try {
                    const sz = node.computeSize();
                    if (node.setSize) node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                    node.setDirtyCanvas && node.setDirtyCanvas(true, true);
                } catch (_e) {}
            }
            node._zeonResSync = sync;

            const wrap = (w) => {
                let v = w.value;
                const d = Object.getOwnPropertyDescriptor(w, "value") ||
                    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(w), "value");
                Object.defineProperty(w, "value", {
                    configurable: true,
                    get() { return d && d.get ? d.get.call(w) : v; },
                    set(nv) {
                        if (d && d.set) d.set.call(w, nv); else v = nv;
                        sync();
                    },
                });
            };
            wrap(orientW); wrap(landW); wrap(portW); wrap(baseW);

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { sync(); } catch (_e) {}
                return r;
            };

            sync();
        } catch (err) {
            console.error("[ZeonmkII Resolution] setup error:", err);
        }
    },
});
