/**
 * ComfyUI-ZeonmkII-Nodes — LoRAs Loader UI (v0.11.0, the real dynamic)
 *
 * Pixaroma's Add-LoRA pattern, our skin: the node starts EMPTY, "➕ Add LoRA"
 * reveals one row at a time (combo + model/clip strengths), each row gets an
 * eye toggle and a ✕ that removes it and shifts the stack up.
 *
 * v0.10.0's sin was hiding rows with display:none — the node never shrank
 * because hidden widgets still reported height. The fix is the classic
 * mechanic (KJNodes/efficiency-nodes proven): a hidden widget reports
 * computeSize [0,-4] (zero footprint in the widget stack) and serializes
 * null, then node.setSize(node.computeSize()) rebuilds the node from the
 * REAL widget sum. Restore: onConfigure re-reads the combos and re-reveals
 * exactly the rows that hold a LoRA.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand, ZEON } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII LoRAs Loader";
const MAX_LORAS = 8;

function shortName(v) {
    const s = String(v ?? "None");
    return s === "None" ? "—" : s.split("/").pop().replace(/\.(safetensors|pt|bin|ckpt|gguf)$/i, "");
}

function setWidgetHidden(widget, hidden) {
    if (!widget) return;
    if (hidden) {
        if (!widget._zeonOrig) {
            widget._zeonOrig = {
                computeSize: widget.computeSize,
                serializeValue: widget.serializeValue,
            };
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

function resizeNode(node) {
    try {
        const sz = node.computeSize();
        if (node.setSize) node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
        else node.size = [Math.max(node.size[0], sz[0]), sz[1]];
        node.setDirtyCanvas && node.setDirtyCanvas(true, true);
    } catch (_e) { /* sizing is cosmetic; never kill the row logic */ }
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.LoRAsLoader",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const slots = [];
            for (let i = 1; i <= MAX_LORAS; i++) {
                slots[i] = {
                    enabled: node.widgets.find((x) => x.name === `enabled_${i}`),
                    lora: node.widgets.find((x) => x.name === `lora_${i}`),
                    sm: node.widgets.find((x) => x.name === `strength_model_${i}`),
                    sc: node.widgets.find((x) => x.name === `strength_clip_${i}`),
                };
            }
            if (!slots[1].lora) return;

            // ── panel: header (Add LoRA) + one strip per visible row ──────
            const panel = document.createElement("div");
            panel.style.cssText = "padding:4px 8px 2px 8px;";
            const header = document.createElement("div");
            header.className = "zeon-chiprow";
            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "zeon-btn";
            addBtn.style.flex = "1 1 auto";
            addBtn.textContent = "➕ Add LoRA";
            header.appendChild(addBtn);
            panel.appendChild(header);

            const stripWrap = document.createElement("div");
            panel.appendChild(stripWrap);

            const band = makeBand(node);
            const panelW = node.addDOMWidget("zeon_lora_panel", "panel", panel, {
                serialize: false,
                getMinHeight: () => 38 + node._zeonLoraRows * 26,
            });
            panelW.serialize = false;

            // panel sits right above the first slot widget
            const idx = node.widgets.indexOf(slots[1].lora);
            if (idx >= 0) {
                node.widgets.splice(node.widgets.indexOf(panelW), 1);
                node.widgets.splice(idx, 0, panelW);
            }

            node._zeonLoraRows = 0;

            function rowsCount() { return node._zeonLoraRows; }

            function renderStrips() {
                stripWrap.innerHTML = "";
                const n = rowsCount();
                for (let r = 0; r < n; r++) {
                    const s = slots[r + 1];
                    const row = document.createElement("div");
                    row.className = "zeon-chiprow";
                    row.style.flexWrap = "nowrap";
                    row.style.alignItems = "center";

                    const hue = document.createElement("span");
                    hue.style.cssText = `width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:${ZEON.SLOT_HUES[r]};`;

                    const eye = document.createElement("button");
                    eye.type = "button";
                    eye.className = "zeon-chip";
                    eye.title = "Toggle this LoRA on/off (bypass without losing the settings)";
                    const on = s.enabled.value !== false;
                    eye.textContent = on ? "👁" : "🚫";
                    eye.style.opacity = on ? "1" : "0.45";
                    eye.addEventListener("click", (e) => {
                        e.stopPropagation();
                        s.enabled.value = s.enabled.value === false;
                        renderStrips();
                    });

                    const name = document.createElement("span");
                    name.style.cssText = "font-size:11px;color:#e8e6e3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;";
                    name.textContent = shortName(s.lora.value);
                    name.title = String(s.lora.value ?? "");

                    const del = document.createElement("button");
                    del.type = "button";
                    del.className = "zeon-chip";
                    del.textContent = "✕";
                    del.title = "Remove this row (rows below shift up)";
                    del.addEventListener("click", (e) => {
                        e.stopPropagation();
                        removeRow(r);
                    });

                    row.append(hue, eye, name, del);
                    stripWrap.appendChild(row);
                }
            }

            function sync() {
                const n = rowsCount();
                let on = 0;
                const chain = [];
                for (let r = 0; r < n; r++) {
                    const s = slots[r + 1];
                    const active = s.lora.value && s.lora.value !== "None" && s.enabled.value !== false;
                    if (active) {
                        on++;
                        chain.push(shortName(s.lora.value) + " (" + Number(s.sm.value) + "/" + Number(s.sc.value) + ")");
                    }
                }
                band.text.textContent = on ? `${on} active · ${chain.join(" → ")}` : "no LoRAs — add one";
                addBtn.style.display = n >= MAX_LORAS ? "none" : "";
                renderStrips();
                resizeNode(node);
            }
            node._zeonLoraSync = sync;

            function revealRow() {
                const n = rowsCount();
                if (n >= MAX_LORAS) return;
                const s = slots[n + 1];
                setWidgetHidden(s.lora, false);
                setWidgetHidden(s.sm, false);
                setWidgetHidden(s.sc, false);
                node._zeonLoraRows = n + 1;
                sync();
            }

            function removeRow(r) {
                const n = rowsCount();
                // shift rows r+1..n up one slot, clear the tail
                for (let j = r + 1; j <= n; j++) {
                    const dst = slots[j], src = slots[j + 1] || null;
                    if (src) {
                        dst.lora.value = src.lora.value;
                        dst.sm.value = src.sm.value;
                        dst.sc.value = src.sc.value;
                        dst.enabled.value = src.enabled.value;
                    } else {
                        dst.lora.value = "None";
                        dst.sm.value = 1.0;
                        dst.sc.value = 0.3;
                        dst.enabled.value = true;
                    }
                }
                node._zeonLoraRows = n - 1;
                sync();
            }

            function restore() {
                // re-derive visible rows from the loaded widget values,
                // compacting gaps (any slot with a real LoRA joins the stack)
                for (let i = 1; i <= MAX_LORAS; i++) {
                    const s = slots[i];
                    const has = s.lora.value && s.lora.value !== "None";
                    setWidgetHidden(s.lora, !has);
                    setWidgetHidden(s.sm, !has);
                    setWidgetHidden(s.sc, !has);
                }
                const holders = [];
                for (let i = 1; i <= MAX_LORAS; i++) {
                    const s = slots[i];
                    if (s.lora.value && s.lora.value !== "None") holders.push({
                        lora: s.lora.value, sm: s.sm.value, sc: s.sc.value, en: s.enabled.value !== false,
                    });
                }
                node._zeonLoraRows = 0;
                for (let r = 0; r < holders.length; r++) {
                    const s = slots[r + 1];
                    s.lora.value = holders[r].lora;
                    s.sm.value = holders[r].sm;
                    s.sc.value = holders[r].sc;
                    s.enabled.value = holders[r].en;
                    node._zeonLoraRows = r + 1;
                }
                sync();
            }
            node._zeonLoraRestore = restore;

            addBtn.addEventListener("click", (e) => { e.stopPropagation(); revealRow(); });

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { if (typeof this._zeonLoraRestore === "function") this._zeonLoraRestore(); } catch (_e) {}
                return r;
            };

            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
            };

            sync();
        } catch (err) {
            console.error("[ZeonmkII LoRAs Loader] setup error:", err);
        }
    },
});
