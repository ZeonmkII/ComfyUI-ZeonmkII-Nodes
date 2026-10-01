/**
 * ComfyUI-ZeonmkII-Nodes — Character Swap v2 UI (skinned)
 *
 * Same proven dynamic-slot architecture as v1 (hidden-flag toggleWidget,
 * anti-shift restore guard, post-settle first pass). v2 adds the shared
 * skin: toolbar button + selection band, per-slot hue colors.
 */
import { app } from "/scripts/app.js";
import { ZEON, applyNodeSkin, makeToolbar, makeBand } from "./zeonmkii_skin.js";

const HIDDEN_TAG = "zeon_hidden";
const NODE_CLASS = "ZeonmkII Character Swap v2";
const MAX_SLOTS = 8;
const origProps = {};

const SLOT_FIELD_BASES = ["enabled_", "lora_", "trigger_", "strength_model_", "strength_clip_"];

function findWidget(node, name) {
    return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

function toggleWidget(widget, show) {
    if (!widget) return;
    if (!origProps[widget.name]) {
        origProps[widget.name] = { origType: widget.type, origComputeSize: widget.computeSize };
    }
    widget.hidden = !show;
    widget.type = show ? origProps[widget.name].origType : HIDDEN_TAG;
    widget.computeSize = show ? origProps[widget.name].origComputeSize : () => [0, -4];
    if (widget.linkedWidgets) {
        for (const w of widget.linkedWidgets) toggleWidget(w, show);
    }
}

function currentChosen(node) {
    const mode = findWidget(node, "select_mode");
    const sel = findWidget(node, "selection");
    if (mode && mode.value === "manual" && sel) {
        const i = Math.max(1, Math.min(MAX_SLOTS, sel.value | 0));
        return { index: i, manual: true };
    }
    return { index: null, manual: false };
}

function updateVisibility(node, band) {
    const countWidget = findWidget(node, "char_count");
    if (!countWidget) return;
    const count = Math.max(1, Math.min(MAX_SLOTS, countWidget.value | 0));

    for (let i = 1; i <= MAX_SLOTS; i++) {
        const visible = i <= count;
        for (const base of SLOT_FIELD_BASES) {
            toggleWidget(findWidget(node, base + i), visible);
        }
        // per-slot identity: tint the trigger field's label via widget colors
        const trig = findWidget(node, "trigger_" + i);
        if (trig) trig.label = visible ? `✦ char ${i}` : `✦ char ${i}`;
    }

    // selection band
    if (band) {
        const { index, manual } = currentChosen(node);
        const enabledW = findWidget(node, "enabled_" + (index ?? 1));
        const on = !manual || (enabledW ? enabledW.value !== false : true);
        band.el.style.borderLeftColor = index ? ZEON.SLOT_HUES[index - 1] : ZEON.ACCENT_DIM;
        band.hue.style.background = index ? ZEON.SLOT_HUES[index - 1] : "transparent";
        band.text.textContent = manual
            ? `→ char ${index}${on ? "" : " (benched — pass-through)"}`
            : "→ random mode";
    }

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
        get() { return desc?.get ? desc.get.call(widget) : widgetValue; },
        set(newVal) {
            if (desc?.set) desc.set.call(widget, newVal);
            else widgetValue = newVal;
            onChange(newVal);
        },
    });
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.CharacterSwapV2",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        applyNodeSkin(node);
        const band = makeBand(node);

        makeToolbar(node, [
            {
                label: "🎲 Random pick",
                title: "Switch to random mode and roll a fresh seed now.",
                onClick(btn) {
                    const mode = findWidget(node, "select_mode");
                    const seed = findWidget(node, "random_seed");
                    if (mode) mode.value = "random";
                    if (seed) seed.value = Math.floor(Math.random() * 0xffffffff);
                    updateVisibility(node, band);
                },
            },
            {
                label: "Max slots",
                title: "Open all 8 character slots.",
                onClick() {
                    const c = findWidget(node, "char_count");
                    if (c) c.value = MAX_SLOTS;
                    updateVisibility(node, band);
                },
            },
        ]);

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
                console.error("[ComfyUI-ZeonmkII-Nodes] v2 restore guard failed:", e);
            }
            return origConfigure ? origConfigure.apply(this, arguments) : undefined;
        };

        for (const w of node.widgets || []) {
            if (["char_count", "select_mode", "selection", "enabled_1"].includes(w.name)) {
                interceptWidgetValue(w, () => updateVisibility(node, band));
            }
        }

        // First visibility pass ONLY after the restore window fully settled.
        setTimeout(() => updateVisibility(node, band), 100);
    },
});
