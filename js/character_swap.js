/**
 * ComfyUI-ZeonmkII-Nodes — Character Swap UI (v0.17.3 look pass)
 *
 * Dynamic slot visibility that survives workflow save/load.
 * Architecture mirrors LoRA-Optimizer's lora_stack_dynamic.js (proven on
 * ComfyUI 0.37.x): NEVER touch widgets during the configure/value-restore
 * window — ComfyUI restores widgets_values POSITIONALLY, so any interference
 * mid-restore shifts every value. Hide widgets via hidden flag + type-rename
 * + computeSize collapse; reapply visibility only after everything settled.
 *
 * v0.17.3 look pass (Boss, 19:08 "match the pack look"): palette now comes
 * from zeonmkii_skin.js (no more inline color copies), ✋/🎲 mode chips
 * drive the collapsed select_mode combo, and a live selection band shows
 * the current state — slot hue dot + character/trigger/LoRA in manual mode,
 * live-range + seed in random mode. Function untouched; every piece of the
 * v0.3.0 restore machinery below is kept verbatim.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand, ZEON } from "./zeonmkii_skin.js";

const HIDDEN_TAG = "zeon_hidden";
const NODE_CLASS = "ZeonmkII Character Swap";
const MAX_SLOTS = 8;
const origProps = {};

const SLOT_FIELD_BASES = ["enabled_", "lora_", "trigger_", "strength_model_", "strength_clip_"];

function findWidget(node, name) {
    return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

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

function updateVisibility(node) {
    const countWidget = findWidget(node, "char_count");
    if (!countWidget) return;
    const count = Math.max(1, Math.min(MAX_SLOTS, countWidget.value | 0));

    for (let i = 1; i <= MAX_SLOTS; i++) {
        const visible = i <= count;
        for (const base of SLOT_FIELD_BASES) {
            toggleWidget(findWidget(node, base + i), visible);
        }
    }

    // computeSize() reflects only visible widgets (hidden ones collapse to
    // [0,-4]), and setSize() CAN shrink — so the node tracks char_count
    // both live and on workflow load (saved oversized sizes snap down).
    node.setSize([node.size[0], node.computeSize()[1]]);
    app.canvas?.setDirty?.(true, true);
    node._zeonCSUpdateBand?.();
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

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.CharacterSwap",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        ensureStyles();
        applyNodeSkin(node);

        // --- Anti-shift restore guard (v0.3.0, verbatim) ---
        // ComfyUI deals saved widget values POSITIONALLY, and something in the
        // 0.37.x restore path consumes one head-of-list value for this node,
        // shifting everything up one (cumulatively, every reopen). By-name
        // values cannot shift — so before the deal, rebuild the positional
        // array from widgets_values_named in current widget order. Same hook
        // class LoRA-Optimizer uses for its widgets_values migration.
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
            return origConfigure ? origConfigure.apply(this, arguments) : undefined;
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
                });
                row.appendChild(c);
                return c;
            };
            const chipManual = mk("✋ Manual", "manual", "Use the selection number below.");
            const chipRandom = mk("🎲 Random", "random", "Seeded random pick among enabled characters in range.");
            const syncChips = () => {
                const v = String(modeW.value ?? "manual");
                chipManual.classList.toggle("active", v === "manual");
                chipRandom.classList.toggle("active", v === "random");
            };
            const chipsW = node.addDOMWidget("zeon_cswap_modes", "zeonmkii/chips", row, {
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

        // --- Value watches: char_count (existing) + band inputs ---
        for (const w of node.widgets || []) {
            if (!w?.name) continue;
            if (w.name === "char_count") {
                interceptWidgetValue(w, () => updateVisibility(node));
            } else if (
                w.name === "selection" || w.name === "random_min" ||
                w.name === "random_max" || w.name === "random_seed" ||
                /^(trigger_|enabled_|lora_)\d+$/.test(w.name)
            ) {
                interceptWidgetValue(w, () => node._zeonCSUpdateBand?.());
            }
        }

        // First visibility pass ONLY after the restore window fully settled.
        // No onConfigure hook, no setTimeout(0) — nothing touches widgets
        // while ComfyUI applies saved values.
        setTimeout(() => {
            updateVisibility(node);
            node._zeonCSSyncChips?.();
        }, 100);
    },
});
