/**
 * ComfyUI-ZeonmkII-Nodes — Pipe Insert UI (v0.29.0)
 *
 * Boss's adjustment list item [1] (Oct 6 00:19): the node wore 4× bland
 * native widget pairs (target+mode) for slots that were usually empty.
 * The LoRA Loader / CharSwap look instead: rows exist ONLY for slots whose
 * value input is wired, each row = [⇦ n] [target ▾] [mode ▾], our own DOM.
 *
 * Pack laws honored:
 *   - target_N / mode_N native widgets stay as serializing value stores,
 *     hidden via the sanctioned trio (hidden + computeSize[0,-4] +
 *     canvasOnly, NO type rename — v0.26.1 law). Our selects write them.
 *   - Select option lists read from the native widgets' own options.values
 *     (declared in pipe.py INPUT_TYPES) — zero duplication, combos stay
 *     in sync with Python by construction.
 *   - DOM-widget law: state-derived height constants (rows × ROW_H),
 *     never measured; textContent/Option only, never innerHTML; unique
 *     addDOMWidget type string.
 *   - Rows rebuild ONLY when the connected-slot set changes — never under
 *     an open select (changing a dropdown never rebuilds anything).
 *   - Restore path: onConfigure re-assert + 100ms settle pass (CharSwap).
 *
 * Python side: UNTOUCHED (pipe.py v0.24+ reads value/target/mode as-is).
 * JS-only runtime change → hard refresh deploy.
 */
import { app } from "/scripts/app.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough } from "./shared/index.mjs";

const NODE_CLASS = "ZeonmkII Pipe Insert";
const SLOTS = 4;
const MIN_W = 300;
const PAD = 6;
const ROW_H = 30; // one select row (state-derived constant — never measured)
const HINT_H = 22;

function findWidget(node, name) {
    return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

function slotIsWired(node, i) {
    const inp = (node.inputs || []).find((x) => x.name === `value_${i}`);
    return !!(inp && inp.link != null);
}

function wiredSlots(node) {
    const a = [];
    for (let i = 1; i <= SLOTS; i++) if (slotIsWired(node, i)) a.push(i);
    return a;
}

function contentH(node) {
    const n = wiredSlots(node).length;
    return PAD + (n > 0 ? n * ROW_H : HINT_H) + PAD;
}

function injectCSS() {
    if (document.getElementById("z-pi-css")) return;
    const s = document.createElement("style");
    s.id = "z-pi-css";
    s.textContent = `
    .z-pi-root { width:100%; box-sizing:border-box; padding:${PAD}px 2px;
      display:flex; flex-direction:column; gap:5px; }
    .z-pi-hint { font-size:10px; color:#5a5e63; letter-spacing:.6px;
      padding:2px 2px; }
    .z-pi-row { display:flex; align-items:center; gap:4px; }
    .z-pi-tag { font-size:10px; color:#4fb8d8; white-space:nowrap;
      min-width:22px; text-align:right; }
    .z-pi-sel { box-sizing:border-box; background:#121316; color:#e8e6e3;
      border:1px solid #232529; border-radius:5px;
      font:10px/1.2 ui-monospace,Menlo,Consolas,monospace; padding:3px 4px; }
    .z-pi-target { flex:2 1 0; min-width:0; border-left:2px solid #A20000; }
    .z-pi-mode { flex:1 1 0; min-width:0; }
    `;
    document.head.appendChild(s);
}

// The sanctioned hide — target_N/mode_N stay serializing value stores.
function hidePairWidgets(node) {
    for (let i = 1; i <= SLOTS; i++) {
        for (const name of [`target_${i}`, `mode_${i}`]) {
            const w = findWidget(node, name);
            if (!w) continue;
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
    }
}

// Populate a select from a native combo widget's option list; keeps an
// out-of-list current value visible as an extra option (display = truth).
function fillSelect(sel, w) {
    const vals = (w && w.options && Array.isArray(w.options.values)) ? w.options.values : [];
    const cur = String(w ? w.value ?? "" : "");
    sel.replaceChildren(...vals.map((v) => new Option(String(v), String(v))));
    if (cur && !vals.map(String).includes(cur)) {
        sel.add(new Option(cur + " (?)", cur));
    }
    if (cur) sel.value = cur;
}

function renderRows(node, root) {
    const key = wiredSlots(node).join(",");
    if (root.dataset.key === key) return; // connected set unchanged — no rebuild
    root.dataset.key = key;
    root.replaceChildren();
    if (!key) {
        const hint = document.createElement("div");
        hint.className = "z-pi-hint";
        hint.textContent = "⇢ wire any value into a value_N slot — its row appears here";
        root.appendChild(hint);
        return;
    }
    for (const i of key.split(",").map(Number)) {
        const row = document.createElement("div");
        row.className = "z-pi-row";
        const tag = document.createElement("span");
        tag.className = "z-pi-tag";
        tag.textContent = `⇦ ${i}`;
        const tSel = document.createElement("select");
        tSel.className = "z-pi-sel z-pi-target";
        tSel.title = "which Save Image field this value lands in";
        const mSel = document.createElement("select");
        mSel.className = "z-pi-sel z-pi-mode";
        mSel.title = "append comma-joins into the field";
        row.appendChild(tag);
        row.appendChild(tSel);
        row.appendChild(mSel);
        root.appendChild(row);
        fillSelect(tSel, findWidget(node, `target_${i}`));
        fillSelect(mSel, findWidget(node, `mode_${i}`));
        tSel.addEventListener("change", () => {
            const w = findWidget(node, `target_${i}`);
            if (w) w.value = tSel.value;
            node.setDirtyCanvas?.(true, true);
        });
        mSel.addEventListener("change", () => {
            const w = findWidget(node, `mode_${i}`);
            if (w) w.value = mSel.value;
            node.setDirtyCanvas?.(true, true);
        });
    }
}

function fitNode(node) {
    const w = Math.max(node.size?.[0] || 0, MIN_W);
    try {
        const cs = node.computeSize?.();
        if (cs && cs[1] > 0) {
            node.setSize?.([w, Math.round(cs[1])]);
            return;
        }
    } catch (_e) { /* fall through */ }
    node.setSize?.([w, node.size?.[1] || 160]);
    app.canvas?.setDirty?.(true, true);
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.PipeInsert",

    setup() {
        console.info("[zeonmkii] pi: pipe_insert v0.29.0 online (dynamic rows)");
    },

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        injectCSS();

        const root = document.createElement("div");
        root.className = "z-pi-root";
        const rowsH = () => contentH(node);
        const panel = node.addDOMWidget("zeon_pi_rows", "zeonmkii_pipe_insert", root, {
            getValue: () => null,
            setValue: () => {},
            serialize: false,
            getMinHeight: () => rowsH(),
            getMaxHeight: () => rowsH(),
            margin: 0,
        });
        panel.serialize = false;
        panel.computeLayoutSize = () => ({ minHeight: rowsH(), minWidth: 1 });
        applyAdaptiveCanvasOnly(panel);
        installCanvasZoomPassthrough(root);
        node._zeonPiRoot = root;

        function refresh(structural) {
            renderRows(node, root);
            if (structural) fitNode(node);
            node.setDirtyCanvas?.(true, true);
        }

        // Wire/unwire a value slot → rows appear/disappear.
        const origConn = node.onConnectionsChange;
        node.onConnectionsChange = function (...args) {
            if (typeof origConn === "function") origConn.apply(this, args);
            refresh(true);
        };

        // Restore path: re-assert hides + rows after configure.
        const origConfigure = node.configure;
        node.configure = function (info) {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try {
                hidePairWidgets(node);
                root.dataset.key = ""; // force row rebuild from restored links
                refresh(true);
            } catch (e) {
                console.error("[zeonmkii] pi: post-restore refresh failed:", e);
            }
            return r;
        };

        hidePairWidgets(node);
        if (!Array.isArray(node.size)) node.size = [MIN_W, 0];
        node.size[0] = Math.max(node.size[0] || 0, MIN_W);
        refresh(true);

        // CharSwap law: re-assert once after the restore window settles.
        setTimeout(() => {
            hidePairWidgets(node);
            root.dataset.key = "";
            refresh(true);
        }, 100);
    },
});
