// ZeonmkII Character Swap — extension entry. Owns the widget stack (chips, rows,
// band), the v0.3.0 by-name restore guard, hiding of the DOM-owned native
// widgets, node sizing, and the value interceptors that keep the DOM in sync.
//
// Architecture law (v0.3.0, kept verbatim where it matters): ComfyUI restores
// widget values POSITIONALLY, so nothing may reorder or mutate the widgets array
// during the configure/value-restore window — hiding via the hidden flag +
// type-rename + computeSize collapse is the sanctioned op, and it is what the
// chips already did at creation time through v0.17.x. The DOM rows are a pure
// VIEW over the native widgets: every control writes widget.value, Python never
// changes, and the restore guard keeps by-name values from shifting.

import { app } from "../../../scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand, ZEON } from "../zeonmkii_skin.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough } from "../shared/index.mjs";
import { isVueNodes } from "../shared/nodes2.mjs";
import { closeLoraDropdown } from "../lora_loader/dropdown.mjs";
import { listLoras } from "../lora_loader/api.mjs";
import { renderRows, contentHeight, findWidget, injectRowsCSS, MAX_SLOTS, WIDGET_NAME } from "./rows.mjs";
import { attachInteractions } from "./interact.mjs";

const NODE_CLASS = "ZeonmkII Character Swap";
const HIDDEN_TAG = "zeon_hidden";
const MIN_W = 320;
const origProps = {};

const SLOT_FIELD_BASES = ["enabled_", "lora_", "trigger_", "strength_model_", "strength_clip_"];
// Native widgets the DOM now owns — hidden from the stack but still the
// serialized value store the Python node reads.
const DOM_OWNED = ["char_count", "selection", "random_min", "random_max", "select_mode"];

function toggleWidget(widget, show) {
    if (!widget) return;

    if (!origProps[widget.name]) {
        origProps[widget.name] = {
            origType: widget.type,
            origComputeSize: widget.computeSize,
        };
    }

    widget.hidden = !show;
    widget.type = show ? origProps[widget.name].origType : HIDDEN_TAG;
    widget.computeSize = show
        ? origProps[widget.name].origComputeSize
        : () => [0, -4];

    // linked widgets (e.g. a seed's control_after_generate) hide with parent
    if (widget.linkedWidgets) {
        for (const w of widget.linkedWidgets) toggleWidget(w, show);
    }
}

function hideDomOwnedWidgets(node) {
    for (const name of DOM_OWNED) toggleWidget(findWidget(node, name), false);
    for (let i = 1; i <= MAX_SLOTS; i++) {
        for (const base of SLOT_FIELD_BASES) toggleWidget(findWidget(node, base + i), false);
    }
}

function interceptWidgetValue(widget, onChange) {
    let widgetValue = widget.value;
    const desc =
        Object.getOwnPropertyDescriptor(widget, "value") ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(widget), "value");

    Object.defineProperty(widget, "value", {
        configurable: true,
        enumerable: true,
        get() {
            return desc?.get ? desc.get.call(widget) : widgetValue;
        },
        set(newVal) {
            if (desc?.set) desc.set.call(widget, newVal);
            else widgetValue = newVal;
            onChange(newVal);
        },
    });
}

function countOf(node) {
    const n = parseInt(findWidget(node, "char_count")?.value, 10);
    return Number.isFinite(n) ? Math.max(1, Math.min(MAX_SLOTS, n)) : 4;
}

// Width floor + height that hugs the content (computeSize sums the visible
// native widgets and the DOM widgets' getMinHeight — the rows widget's is the
// state-derived contentHeight, so the node tracks the live slot count).
function fitNode(node) {
    const w = Math.max(node.size?.[0] || 0, MIN_W);
    try {
        const cs = node.computeSize?.();
        if (cs && cs[1] > 0) {
            node.setSize?.([w, Math.round(cs[1])]);
            return;
        }
    } catch (_e) { /* fall through to the old pattern */ }
    node.setSize?.([w, node.size?.[1] || 400]);
    app.canvas?.setDirty?.(true, true);
}

function makeRefresh(node) {
    return (structural) => {
        renderRows(node);
        node._zeonCSUpdateBand?.();
        if (structural) fitNode(node);
        node.setDirtyCanvas?.(true, true);
    };
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.CharacterSwap",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        if (nodeType.prototype._zeonCsPatched) return;
        nodeType.prototype._zeonCsPatched = true;

        injectRowsCSS();

        // Legacy only: keep the width floored and the height hugging the rows so
        // the DOM can never be clipped by a hand-shrunk node. In Nodes 2.0 the
        // rendered size lives in the Vue layout store (getMinHeight /
        // computeLayoutSize already lock it) — clamping here would desync
        // (Nodes 2.0 resize rule, same reason the loader skips it there).
        const _origResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            if (!isVueNodes()) {
                if (this.size[0] < MIN_W) this.size[0] = MIN_W;
                try {
                    const cs = this.computeSize?.();
                    if (cs && cs[1] > 0) this.size[1] = Math.round(cs[1]);
                } catch (_e) { /* cosmetic guard only */ }
            }
            return _origResize ? _origResize.call(this, size) : undefined;
        };

        const _origRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            closeLoraDropdown(); // transient — also auto-closes on the deleting click
            return _origRemoved?.apply(this, arguments);
        };
    },

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        ensureStyles();
        applyNodeSkin(node);

        // --- Anti-shift restore guard (v0.3.0, verbatim) ---
        // By-name values cannot shift, so before the positional deal, rebuild the
        // array from widgets_values_named in current widget order. After the deal
        // completes (origConfigure returned), re-assert hiding and repaint the
        // rows from the restored values — reads only, zero widget writes.
        const origConfigure = node.configure;
        node.configure = function (info) {
            try {
                if (info && info.widgets_values_named && Array.isArray(node.widgets) && node.widgets.length) {
                    const named = info.widgets_values_named;
                    info.widgets_values = node.widgets
                        .filter((w) => w.serialize !== false)
                        .map((w) => (w.name in named ? named[w.name] : w.value));
                }
            } catch (e) {
                console.error("[ComfyUI-ZeonmkII-Nodes] restore guard failed:", e);
            }
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try {
                hideDomOwnedWidgets(node);
                renderRows(node);
                node._zeonCSUpdateBand?.();
            } catch (e) {
                console.error("[ComfyUI-ZeonmkII-Nodes] post-restore repaint failed:", e);
            }
            return r;
        };

        // --- Live selection band (pack look: hue dot + state line) ---
        const band = makeBand(node);
        const updateBand = () => {
            try {
                const mode = String(findWidget(node, "select_mode")?.value ?? "manual");
                const count = Math.max(1, Math.min(MAX_SLOTS, (findWidget(node, "char_count")?.value | 0) || 1));
                if (mode === "random") {
                    let lo = findWidget(node, "random_min")?.value | 0 || 1;
                    let hi = findWidget(node, "random_max")?.value | 0 || 1;
                    if (lo > hi) [lo, hi] = [hi, lo];
                    lo = Math.max(1, Math.min(lo, count));
                    hi = Math.max(1, Math.min(hi, count));
                    const seed = findWidget(node, "random_seed")?.value ?? 0;
                    let live = 0;
                    for (let i = lo; i <= hi; i++) {
                        if (findWidget(node, "enabled_" + i)?.value !== false) live++;
                    }
                    band.hue.style.background = ZEON.ACCENT_DIM;
                    band.text.textContent = `🎲 random ${lo}–${hi} · ${live} live · seed ${seed}`;
                } else {
                    const sel = Math.max(1, Math.min(findWidget(node, "selection")?.value | 0 || 1, count));
                    const on = findWidget(node, "enabled_" + sel)?.value !== false;
                    const trig = String(findWidget(node, "trigger_" + sel)?.value || "").trim() || "(no trigger)";
                    const lora = String(findWidget(node, "lora_" + sel)?.value || "None");
                    band.hue.style.background = ZEON.SLOT_HUES[sel - 1] || ZEON.ACCENT;
                    band.text.textContent = on
                        ? `✋ #${sel} ${trig} · ${lora === "None" ? "text-only" : lora}`
                        : `✋ #${sel} benched — pass-through`;
                }
            } catch (_e) { /* cosmetic only */ }
        };
        node._zeonCSUpdateBand = updateBand;

        // --- Mode chips (✋/🎲) — drive the collapsed select_mode combo ---
        let chipsW = null;
        const modeW = findWidget(node, "select_mode");
        if (modeW) {
            const row = document.createElement("div");
            row.className = "zeon-chiprow";
            const mk = (label, value, title) => {
                const c = document.createElement("button");
                c.type = "button";
                c.className = "zeon-chip";
                c.textContent = label;
                c.title = title;
                c.addEventListener("click", () => {
                    modeW.value = value;
                    syncChips();
                    updateBand();
                    renderRows(node); // config strip dims by mode
                });
                row.appendChild(c);
                return c;
            };
            const chipManual = mk("✋ Manual", "manual", "Use the pick number in the config strip.");
            const chipRandom = mk("🎲 Random", "random", "Seeded random pick among enabled characters in range.");
            const syncChips = () => {
                const v = String(modeW.value ?? "manual");
                chipManual.classList.toggle("active", v === "manual");
                chipRandom.classList.toggle("active", v === "random");
            };
            chipsW = node.addDOMWidget("zeon_cswap_modes", "zeonmkii/chips", row, {
                serialize: false,
                getMinHeight: () => 30,   // constant — DOM-widget law, never measure
            });
            chipsW.serialize = false;
            // splice the chips exactly where the combo sat
            const at = node.widgets.indexOf(modeW);
            if (at >= 0 && at < node.widgets.length - 1) node.widgets.splice(at, 0, node.widgets.pop());
            toggleWidget(modeW, false);  // combo hides — chips own it now
            node._zeonCSSyncChips = syncChips;
            syncChips();
        }

        // --- The rows widget (config strip + one row pair per character) ---
        const root = document.createElement("div");
        root.className = "z-cs-root";
        const rowsH = () => contentHeight(countOf(node));
        const rowsW = node.addDOMWidget(WIDGET_NAME, "zeonmkii_cswap_rows", root, {
            getValue: () => null,
            setValue: () => {},
            serialize: false,
            getMinHeight: () => rowsH(),  // state-derived constant, never measured
            getMaxHeight: () => rowsH(),
            margin: 4,
        });
        rowsW.serialize = false;
        rowsW.computeLayoutSize = () => ({ minHeight: rowsH(), minWidth: 1 });
        applyAdaptiveCanvasOnly(rowsW);
        // Wheel over the rows must still zoom the canvas (Classic; no-ops in 2.0).
        installCanvasZoomPassthrough(root);
        node._zeonCsRoot = root;
        node._zeonCsRowsW = rowsW;

        // Place the rows right after the chips (fallback: before random_seed), so
        // the visual stack is token · chips · rows · seed · band.
        {
            let at = chipsW ? node.widgets.indexOf(chipsW) + 1 : -1;
            if (at < 0) {
                const seedAt = node.widgets.indexOf(findWidget(node, "random_seed"));
                at = seedAt > 0 ? seedAt : node.widgets.length - 1;
            }
            if (at >= 0 && at < node.widgets.length - 1) node.widgets.splice(at, 0, node.widgets.pop());
        }

        attachInteractions(node, rowsW.element || root, makeRefresh(node));

        // Hide every native widget the DOM owns (flag-only — the same op class the
        // chips have run at creation time since v0.17.x; values stay serialized).
        hideDomOwnedWidgets(node);

        // --- Value watches: DOM repaints on ANY widget write (ours or restore's).
        for (const w of node.widgets || []) {
            if (!w?.name) continue;
            if (w.name === "char_count") {
                interceptWidgetValue(w, () => {
                    renderRows(node);
                    fitNode(node);
                    node._zeonCSUpdateBand?.();
                    app.canvas?.setDirty?.(true, true);
                });
            } else if (
                w.name === "selection" || w.name === "random_min" ||
                w.name === "random_max" || w.name === "random_seed" ||
                /^(trigger_|enabled_|lora_|strength_model_|strength_clip_)\d+$/.test(w.name)
            ) {
                interceptWidgetValue(w, () => {
                    node._zeonCSUpdateBand?.();
                    renderRows(node);
                });
            }
        }

        // Fresh default size (configure() overrides for a loaded node).
        fitNode(node);

        // First pass ONLY after the restore window fully settled (v0.3.0 law:
        // no onConfigure hook, no setTimeout(0) — hide + paint re-asserted here).
        setTimeout(() => {
            hideDomOwnedWidgets(node);
            renderRows(node);
            fitNode(node);
            node._zeonCSSyncChips?.();
            node._zeonCSUpdateBand?.();
        }, 100);

        // Warm the LoRA list so missing-file marks can show without opening the
        // picker (DOM-only repaint, can't dirty a freshly loaded workflow).
        listLoras().then(() => { if (node._zeonCsRoot?.isConnected) renderRows(node); });
    },
});
