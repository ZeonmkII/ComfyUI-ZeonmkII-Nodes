/**
 * ComfyUI-ZeonmkII-Nodes — Input Watcher UI (v0.28.0)
 *
 * Wire ANY into any_in → this node follows the wire to its ORIGIN node,
 * offers a dropdown of the origin's actual widget fields, and shows the
 * picked field's live value. At queue time a graphToPrompt hook (the same
 * pattern as the LoRAs Loader's LoraLoaderState stamp) injects the
 * picked value into the hidden value_cache input, which Python passes
 * through as the STRING output.
 *
 * Pack laws honored:
 *   - REFERENCE-FIRST: stamp = lora_loader/index.js's hook verbatim in
 *     shape (buildIndex with subgraph composite ids, INJECT ONLY, chain
 *     the previous app.graphToPrompt, warn-and-continue on failure).
 *   - DOM-widget law: state-derived height constants, never measured;
 *     textContent only (never innerHTML); unique addDOMWidget type.
 *   - v0.26.1 hide law: input_name stays a serializing value store,
 *     hidden via hidden + computeSize[0,-4] + canvasOnly (NO type rename
 *     — renames render fallback ghosts on the Vue body).
 *   - Plain-string doctrine: nothing here overrides IS_CHANGED/OUTPUT_NODE;
 *     readValue stringifies only widget values (strays are primitives),
 *     never wired objects (v0.26.2 law).
 */
import { app } from "/scripts/app.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough } from "./shared/index.mjs";

const NODE_CLASS = "ZeonmkII Input Watcher";
const MIN_W = 280;
const WIDGET_H = 104; // state-derived constant (origin 14 + select 26 + value 48 + gaps) — DOM-widget law

function findWidget(node, name) {
    return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

// ── origin tracking ──────────────────────────────────────────────────────────
// LiteGraph: one link per input slot, so "multiple wires" resolves to
// whichever wire currently occupies the slot (last-wire-wins by nature).
function originOf(node) {
    const inp = (node.inputs || []).find((x) => x.name === "any_in");
    if (!inp || inp.link == null) return null;
    const g = node.graph;
    const link = g && g.links ? g.links[inp.link] : null;
    if (!link) return null;
    const src = g && g.getNodeById ? g.getNodeById(link.origin_id) : null;
    return { id: link.origin_id, node: src || null };
}

function fieldNames(originNode) {
    const ws = (originNode && originNode.widgets) || [];
    // Readable values only: skip buttons (no value), non-serializing helpers,
    // and already-hidden value stores — those aren't user-facing fields.
    return ws
        .filter((w) => w && w.serialize !== false && w.type !== "button" && !w.hidden)
        .map((w) => w.name);
}

function readValue(originNode, fieldName) {
    const w = findWidget(originNode, fieldName);
    if (!w) return "";
    const v = w.value;
    if (typeof v === "string") return v;
    if (v === undefined || v === null) return "";
    try {
        const s = JSON.stringify(v);
        return typeof s === "string" ? s : String(v);
    } catch (_e) {
        return String(v);
    }
}

function injectCSS() {
    if (document.getElementById("z-iw-css")) return;
    const s = document.createElement("style");
    s.id = "z-iw-css";
    s.textContent = `
    .z-iw-root { width:100%; box-sizing:border-box; padding:6px 4px;
      display:flex; flex-direction:column; gap:5px; }
    .z-iw-origin { font-size:10px; color:#9aa0a6; letter-spacing:.6px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .z-iw-origin.live { color:#e8e6e3; }
    .z-iw-origin.warn { color:#ff5252; }
    .z-iw-select { width:100%; box-sizing:border-box; background:#121316;
      color:#e8e6e3; border:1px solid #232529; border-left:3px solid #A20000;
      border-radius:6px; font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;
      padding:4px 6px; }
    .z-iw-value { font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;
      color:#e8e6e3; background:#121316; border:1px dashed #232529;
      border-radius:6px; padding:4px 8px; min-height:34px; max-height:48px;
      overflow:hidden; display:-webkit-box; -webkit-line-clamp:3;
      -webkit-box-orient:vertical; word-break:break-all; }
    .z-iw-value.empty { color:#5a5e63; }
    `;
    document.head.appendChild(s);
}

// ── graphToPrompt stamp (lora_loader/index.js pattern, verbatim in shape) ────
function buildIndex() {
    const index = new Map();
    const visit = (graph, prefix) => {
        if (!graph) return;
        for (const n of graph._nodes || graph.nodes || []) {
            if (!n) continue;
            // Composite id ("" at top level, "5:"-style inside a subgraph) so a
            // subgraph node exact-matches its "5:3" prompt id without colliding
            // with a top-level node sharing the bare id.
            const cid = String(prefix) + n.id;
            if (n.comfyClass === NODE_CLASS || n.type === NODE_CLASS) {
                index.set(cid, n);
                if (!index.has(String(n.id))) index.set(String(n.id), n);
            }
            const inner = n.subgraph || n.graph || n._graph;
            if (inner && inner !== graph) visit(inner, cid + ":");
        }
    };
    visit(app.graph, "");
    return index;
}
function findNode(index, id) {
    const s = String(id);
    if (index.has(s)) return index.get(s);
    const tail = s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : null;
    return tail && index.has(tail) ? index.get(tail) : null;
}

const _origGraphToPrompt_fn = app.graphToPrompt;
const _origGraphToPrompt = (...a) => _origGraphToPrompt_fn.apply(app, a);
app.graphToPrompt = async function (...args) {
    const result = await _origGraphToPrompt(...args);
    try {
        const out = result?.output;
        if (out) {
            let index = null;
            for (const id in out) {
                const entry = out[id];
                if (!entry || entry.class_type !== NODE_CLASS) continue;
                if (!index) index = buildIndex();
                entry.inputs = entry.inputs || {};
                const node = findNode(index, id);
                let oid = "";
                let val = "";
                if (node) {
                    const oi = originOf(node);
                    if (oi && oi.node) {
                        oid = String(oi.id);
                        const fieldName = String(findWidget(node, "input_name")?.value ?? "");
                        if (fieldName) val = readValue(oi.node, fieldName);
                    }
                }
                entry.inputs.origin_id = oid;
                entry.inputs.value_cache = val;
            }
        }
    } catch (e) {
        console.warn("[zeonmkii] iw: could not stamp watcher values:", (e && e.message) || e);
    }
    return result;
};

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.InputWatcher",

    setup() {
        console.info("[zeonmkii] iw: input_watcher v0.28.0 online");
    },

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        injectCSS();

        // input_name stays a serializing value store — the sanctioned hide
        // (hidden + collapse + canvasOnly; NO type rename — v0.26.1 lesson).
        function hideNameWidget() {
            const w = findWidget(node, "input_name");
            if (!w) return;
            w.hidden = true;
            w.computeSize = () => [0, -4];
            if (!w.options) w.options = {};
            w.options.canvasOnly = true;
            const hideEl = () => {
                const el = w.element || w.inputEl;
                if (el) el.style.display = "none";
            };
            hideEl();
            requestAnimationFrame(hideEl);
        }

        // ── the panel: origin line · field select · live value ──────────────
        const root = document.createElement("div");
        root.className = "z-iw-root";
        const originLine = document.createElement("div");
        originLine.className = "z-iw-origin";
        const select = document.createElement("select");
        select.className = "z-iw-select";
        const valueLine = document.createElement("div");
        valueLine.className = "z-iw-value empty";
        root.appendChild(originLine);
        root.appendChild(select);
        root.appendChild(valueLine);

        const panel = node.addDOMWidget("zeon_iw_panel", "zeonmkii_input_watcher", root, {
            getValue: () => null,
            setValue: () => {},
            serialize: false,
            getMinHeight: () => WIDGET_H,
            getMaxHeight: () => WIDGET_H,
            margin: 0,
        });
        panel.serialize = false;
        panel.computeLayoutSize = () => ({ minHeight: WIDGET_H, minWidth: 1 });
        applyAdaptiveCanvasOnly(panel);
        installCanvasZoomPassthrough(root);

        let lastValueText = null;
        function updateValue() {
            const oi = originOf(node);
            const nameW = findWidget(node, "input_name");
            const field = String(nameW ? nameW.value ?? "" : "");
            let t = "";
            if (oi && oi.node && field) t = readValue(oi.node, field);
            if (t !== lastValueText) {
                lastValueText = t;
                if (!field) valueLine.textContent = "pick a field above";
                else valueLine.textContent = t === "" ? "— (empty) —" : t;
                valueLine.classList.toggle("empty", !field || t === "");
            }
        }

        function refresh() {
            const oi = originOf(node);
            const nameW = findWidget(node, "input_name");
            originLine.classList.remove("live", "warn");
            if (!oi) {
                originLine.textContent = "⇢ no origin — wire any output into any_in";
            } else if (!oi.node) {
                originLine.textContent = "⇢ origin #" + oi.id + " not found (deleted?)";
                originLine.classList.add("warn");
            } else {
                originLine.textContent = "⇢ #" + oi.id + " · " + (oi.node.title || oi.node.type || "node");
                originLine.classList.add("live");
            }
            const fields = oi && oi.node ? fieldNames(oi.node) : [];
            select.disabled = fields.length === 0;
            select.replaceChildren(
                ...(fields.length
                    ? fields.map((f) => new Option(f, f))
                    : [new Option(oi && oi.node ? "— no readable fields —" : "— wire a node first —", "")])
            );
            // keep the picked name valid; repair to the first field otherwise
            let cur = String(nameW ? nameW.value ?? "" : "");
            if (fields.length && !fields.includes(cur)) {
                cur = fields[0];
                if (nameW) nameW.value = cur;
            }
            if (cur) select.value = cur;
            lastValueText = null; // force a value-line repaint
            updateValue();
            node.setDirtyCanvas?.(true, true);
        }

        select.addEventListener("change", () => {
            const w = findWidget(node, "input_name");
            if (w) w.value = select.value;
            lastValueText = null;
            updateValue();
            node.setDirtyCanvas?.(true, true);
        });

        // Wire/unwire/origin-removal → full recompute.
        const origConn = node.onConnectionsChange;
        node.onConnectionsChange = function (...args) {
            if (typeof origConn === "function") origConn.apply(this, args);
            refresh();
        };

        // Live value while the node is visible — string-gated DOM write
        // (updateValue only touches the DOM when the text actually changed).
        const origDrawFg = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            try { updateValue(); } catch (_e) { /* never block drawing */ }
            return origDrawFg ? origDrawFg.apply(this, arguments) : undefined;
        };

        // Restore path: after configure, re-assert the hide + recompute panel.
        const origConfigure = node.configure;
        node.configure = function (info) {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try { hideNameWidget(); refresh(); } catch (e) {
                console.error("[zeonmkii] iw: post-restore refresh failed:", e);
            }
            return r;
        };

        hideNameWidget();
        if (!Array.isArray(node.size)) node.size = [MIN_W, 0];
        node.size[0] = Math.max(node.size[0] || 0, MIN_W);
        try {
            const cs = node.computeSize?.();
            if (cs && cs[1] > 0) node.setSize([node.size[0], Math.round(cs[1])]);
        } catch (_e) { /* keep whatever size we have */ }
        refresh();

        // CharSwap law: re-assert once after the restore window settles.
        setTimeout(() => {
            hideNameWidget();
            refresh();
        }, 100);
    },
});
