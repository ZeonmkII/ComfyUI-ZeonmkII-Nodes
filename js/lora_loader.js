/**
 * ComfyUI-ZeonmkII-Nodes — LoRAs Loader UI
 *
 * Pixaroma's design language, our skin: one compact row per LoRA slot with
 * a ⏻ power button (crimson = applied, dim = bypassed) and the slot's name
 * echo. The native widgets stay as the serialized truth (name combo +
 * model/clip strengths save and restore exactly like any node); the power
 * row just drives their enabled_ booleans. Band underneath shows the live
 * chain: which slots are on and what they'll apply.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII LoRAs Loader";
const MAX_LORAS = 8;
const HUES = ["#e5484d", "#e88b3a", "#d8b13a", "#5fbf6e", "#4fb8d8", "#7a7af0", "#c76ad0", "#e06a9a"];

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

function slotName(node, i) {
    const w = node.widgets && node.widgets.find((x) => x.name === `lora_${i}`);
    const v = w ? String(w.value || "None") : "None";
    return v === "None" ? "— empty —" : v.split("/").pop().replace(/\.(safetensors|pt|bin|ckpt)$/i, "");
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.LoRAsLoader",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try { if (typeof this._zeonLoraSync === "function") this._zeonLoraSync(); } catch (_e) {}
            return r;
        };
    },

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const countW = node.widgets && node.widgets.find((x) => x.name === "lora_count");
            const enabledWs = [];
            const loraWs = [];
            for (let i = 1; i <= MAX_LORAS; i++) {
                enabledWs[i] = node.widgets.find((x) => x.name === `enabled_${i}`);
                loraWs[i] = node.widgets.find((x) => x.name === `lora_${i}`);
            }
            if (!countW || !enabledWs[1] || !loraWs[1]) return;

            // one power row per slot: ⏻ + colored dot + name echo
            const root = document.createElement("div");
            root.style.padding = "2px 8px 4px 8px";
            const rows = [];
            for (let i = 1; i <= MAX_LORAS; i++) {
                const row = document.createElement("div");
                row.className = "zeon-chiprow";
                row.style.gap = "6px";

                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "zeon-chip";
                btn.textContent = "⏻";
                btn.title = `Toggle LoRA #${i}`;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    enabledWs[i].value = !enabledWs[i].value;
                    sync();
                });

                const dot = document.createElement("span");
                dot.style.cssText = "width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:" + HUES[i - 1] + ";opacity:.35;";
                dot.title = `Slot #${i}`;

                const name = document.createElement("span");
                name.style.cssText = "font-size:11px;color:#e8e6e3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

                row.appendChild(btn);
                row.appendChild(dot);
                row.appendChild(name);
                root.appendChild(row);
                rows[i] = { btn, dot, name };
            }

            const w = node.addDOMWidget("zeon_lora_rows", "loras", root, {
                serialize: false,
                getMinHeight: () => 150,
            });
            w.serialize = false;

            const band = makeBand(node);

            function sync() {
                const n = Math.max(1, Math.min(Number(countW.value) || 1, MAX_LORAS));
                let on = 0;
                const chain = [];
                for (let i = 1; i <= MAX_LORAS; i++) {
                    const active = i <= n;
                    const enabled = !!enabledWs[i].value;
                    const nm = slotName(node, i);
                    const lit = active && enabled;
                    if (lit) {
                        on++;
                        const sw = node.widgets.find((x) => x.name === `strength_model_${i}`);
                        const sc = node.widgets.find((x) => x.name === `strength_clip_${i}`);
                        chain.push(nm + " (" + (sw ? sw.value : 1) + "/" + (sc ? sc.value : 0.3) + ")");
                    }
                    const r = rows[i];
                    r.btn.style.display = active ? "" : "none";
                    r.dot.style.display = active ? "" : "none";
                    r.name.style.display = active ? "" : "none";
                    r.btn.classList.toggle("active", lit);
                    r.btn.style.opacity = enabled ? "1" : "0.45";
                    r.dot.style.opacity = lit ? "1" : "0.35";
                    r.name.textContent = nm;
                    r.name.style.opacity = enabled ? "1" : "0.45";
                }
                band.hue.style.background = HUES[0];
                band.text.textContent = `${on}/${n} on · ` + (chain.length ? chain.join(" → ") : "nothing active");
            }
            node._zeonLoraSync = sync;

            for (let i = 1; i <= MAX_LORAS; i++) {
                if (enabledWs[i]) interceptWidgetValue(enabledWs[i], sync);
                if (loraWs[i]) interceptWidgetValue(loraWs[i], sync);
            }
            interceptWidgetValue(countW, sync);

            sync();
        } catch (err) {
            console.error("[ZeonmkII LoRAs Loader] setup error:", err);
        }
    },
});
