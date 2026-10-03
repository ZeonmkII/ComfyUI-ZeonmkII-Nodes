/**
 * ComfyUI-ZeonmkII-Nodes — Character Swap UI
 *
 * Dynamic slot visibility that survives workflow save/load.
 * Architecture mirrors LoRA-Optimizer's lora_stack_dynamic.js (proven on
 * ComfyUI 0.37.x): NEVER touch widgets during the configure/value-restore
 * window — ComfyUI restores widgets_values POSITIONALLY, so any interference
 * mid-restore shifts every value. Hide widgets via hidden flag + type-rename
 * + computeSize collapse; reapply visibility only after everything settled.
 */
import { app } from "/scripts/app.js";

const HIDDEN_TAG = "zeon_hidden";
const NODE_CLASS = "ZeonmkII Character Swap";
const MAX_SLOTS = 8;
const ACCENT = "#ff2b3a";   // Zeon crimson
const CHARCOAL = "#121316"; // node body
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

        // ZeonmkII skin
        node.color = ACCENT;
        node.bgcolor = CHARCOAL;

        // --- Anti-shift restore guard ---
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

        // char_count changes (spinner, typed, drag) all funnel through value
        for (const w of node.widgets || []) {
            if (w.name === "char_count") {
                interceptWidgetValue(w, () => updateVisibility(node));
            }
        }

        // First visibility pass ONLY after the restore window fully settled.
        // No onConfigure hook, no setTimeout(0) — nothing touches widgets
        // while ComfyUI applies saved values.
        setTimeout(() => updateVisibility(node), 100);
    },
});
