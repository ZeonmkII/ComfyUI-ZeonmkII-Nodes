/**
 * ComfyUI-ZeonmkII-Nodes — String Composer UI (v0.30.2)
 *
 * THE CHARSWAP PATTERN, REAPPLIED (Boss's call, option A — "B is the wrong
 * answer"). Field-proven architecture from character_swap/lora_loader:
 *
 *   - The 8 native slot_N multiline widgets are hidden at creation via the
 *     SANCTIONED toggleWidget (hidden flag + type→"zeon_hidden" + computeSize
 *     collapse). They survive as pure value stores: serialized, restored,
 *     read by Python. Hiding works — v0.25.4's logs proved it (the failure
 *     was only REVEALING textareas later; we never reveal again).
 *   - The visible boxes are OUR OWN DOM textareas inside one hosted widget
 *     (same family as CharSwap's rows): width-tracked, state-derived height
 *     constants (never measured — DOM-widget law), DOM input calls refresh
 *     explicitly (v0.30.1: intercepts REMOVED — Nodes-2.0 locks widget.value
 *     non-configurable; defineProperty throws on it), save/restore untouched.
 *   - ＋/－ are native canvas button widgets (v0.25.4 field-proven alive on
 *     Boss's frontend), kept as the manual floor / wire-ahead controls.
 *     v0.30.0: rows AUTO-GROW — a filled or wired row summons the next one
 *     (born 1, max 8); the preview band is DELETED (Boss: doesn't need it).
 *   - v0.30.2: JS adds a native input socket per slot (hidden widget +
 *     same-named input = convert-to-input's own internal state — no manual
 *     conversion needed). Wired → upstream wins, the row collapses to a slim
 *     ⇦ wired tag; unwired → the typed text returns from the value store.
 *   - Separator escapes + empty-slot skipping: unchanged (Python side).
 *
 * Boss's shape B (v0.30.0 edition): one node IS the prompt stack — born 1,
 * auto-grows to 8 as rows fill.
 *
 * Companion: nodes/text_blocks.py (join logic lives there, unchanged).
 */
import { app } from "/scripts/app.js";
import { ZEON } from "./zeonmkii_skin.js";
import { applyAdaptiveCanvasOnly, installCanvasZoomPassthrough } from "./shared/index.mjs";

const NODE_CLASS = "ZeonmkII String Composer";
const MIN_SLOTS = 1;
const MAX_SLOTS = 8;
const MIN_W = 320;
const WIDGET_NAME = "zeon_sc_rows";

// Height constants — lockstep with the CSS below (state-derived, never measured).
const PAD = 6;
const ROW_H = 74; // label 13 + textarea 52 + margin 6 (+3 slack)

function contentHeight(k) {
    const n = Math.max(1, Math.min(MAX_SLOTS, k | 0));
    return PAD + n * ROW_H + PAD + 2;
}

function findWidget(node, name) {
    return node.widgets ? node.widgets.find((w) => w.name === name) : null;
}

function slotIsWired(node, i) {
    const inp = (node.inputs || []).find((x) => x.name === `slot_${i}`);
    return !!(inp && inp.link != null);
}

// v0.30.2 (Boss 02:12 — "the dynamically built slots doesn't have input slot"):
// every slot gets a native input socket, added from JS. Socket + same-named
// hidden widget is exactly convert-to-input's internal state: wired → the
// upstream link serializes and the row shows ⇦; unwired → the hidden widget's
// typed value serializes. Prompt-side: widget-declared names accept link
// tuples — standard ComfyUI, Python untouched. try/catch per socket so one
// refusal can never kill nodeCreated again (v0.30.1's hard lesson).
function ensureSlotInputs(node) {
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const name = "slot_" + i;
        if (!(node.inputs || []).some((x) => x.name === name)) {
            try { node.addInput(name, "STRING"); } catch (e) { /* keep building */ }
        }
    }
}

function propCount(node) {
    if (!node.properties) node.properties = {};
    const n = Number(node.properties.zeon_slots);
    return Number.isFinite(n) ? Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, n)) : MIN_SLOTS;
}

function effectiveCount(node) {
    let n = propCount(node);
    // v0.30.0 dynamic rows: a filled or wired row summons the next (empty) one.
    // propCount stays the manual floor (＋/－ for wiring ahead of content).
    for (let i = MIN_SLOTS; i <= MAX_SLOTS; i++) {
        if (rowHasText(node, i)) n = Math.max(n, Math.min(MAX_SLOTS, i + 1));
    }
    return Math.max(n, MIN_SLOTS);
}

function rowHasText(node, i) {
    if (slotIsWired(node, i)) return true;
    const w = findWidget(node, "slot_" + i);
    return !!(w && typeof w.value === "string" && w.value.trim() !== "");
}

// The loader's hideJsonWidget op — the sanctioned hide for STRING widgets:
// hidden + computeSize collapse + options.canvasOnly (canvasOnly is what
// EJECTS the widget from the Vue body — v0.26.0's type-rename made the
// frontend render fallback "⇦ slot_N" ghost rows instead. No rename.)
function hideSlotWidgets(node) {
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const w = findWidget(node, "slot_" + i);
        if (!w) continue;
        w.hidden = true;
        w.computeSize = () => [0, -4];
        if (!w.options) w.options = {};
        w.options.canvasOnly = true;
        const hideEl = () => { const el = w.element || w.inputEl; if (el) el.style.display = "none"; };
        hideEl();
        requestAnimationFrame(hideEl);
    }
}

// v0.30.1 LAW (field-proven via Boss's console, 2026-10-06 02:01): the
// Nodes-2.0 frontend defines widget.value as a NON-CONFIGURABLE property —
// Object.defineProperty on it throws "Cannot redefine property: value" and
// that throw killed nodeCreated at the old intercept loop since v0.26.0,
// BEFORE hideSlotWidgets/renderRows ever ran (the bland-8-boxes screenshot).
// No more value intercepts anywhere in this file: DOM typing refreshes
// explicitly, restore lands through the configure wrap's renderRows.

function injectRowsCSS() {
    if (document.getElementById("z-sc-css")) return;
    const s = document.createElement("style");
    s.id = "z-sc-css";
    s.textContent = `
    .z-sc-root { width:100%; box-sizing:border-box; padding:${PAD}px 2px; }
    .z-sc-row { margin:0 0 6px 0; }
    .z-sc-label { font-size:9px; color:#9aa0a6; letter-spacing:1.2px; padding:0 0 2px 2px;
      display:flex; align-items:center; gap:5px; }
    .z-sc-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
    .z-sc-ta { width:100%; box-sizing:border-box; height:52px; resize:none; overflow-y:auto;
      background:#121316; color:#e8e6e3; border:1px solid #232529; border-left:3px solid #A20000;
      border-radius:6px; font:12px/1.4 ui-monospace, Menlo, Consolas, monospace;
      padding:5px 8px; display:block; }
    .z-sc-ta:focus { outline:none; border-color:#750000; }
    .z-sc-ta::placeholder { color:#5a5e63; }
    .z-sc-ta:disabled { opacity:.4; }
    .z-sc-wired { display:none; font-size:10px; color:#4fb8d8; padding:14px 0 2px 2px; }
    .z-sc-row.wired .z-sc-ta { display:none; }
    .z-sc-row.wired .z-sc-wired { display:block; }
    `;
    document.head.appendChild(s);
}

// Incremental row sync — NEVER rebuilds under a focused textarea (preserve
// caret while typing); only touches DOM when state actually changed.
function renderRows(node, root) {
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const show = i <= effectiveCount(node);
        const wired = slotIsWired(node, i);
        let row = root.querySelector(`[data-row="${i}"]`);
        if (!show) { if (row) row.remove(); continue; }
        if (!row) {
            row = document.createElement("div");
            row.className = "z-sc-row";
            row.dataset.row = i;
            const lab = document.createElement("div");
            lab.className = "z-sc-label";
            const dot = document.createElement("span");
            dot.className = "z-sc-dot";
            dot.style.background = ZEON.SLOT_HUES[(i - 1) % ZEON.SLOT_HUES.length];
            lab.appendChild(dot);
            lab.appendChild(document.createTextNode("slot " + i));
            const ta = document.createElement("textarea");
            ta.className = "z-sc-ta";
            ta.spellcheck = false;
            ta.placeholder = "text — or leave empty to skip";
            const tag = document.createElement("div");
            tag.className = "z-sc-wired";
            tag.textContent = "⇦ wired — text arrives from the link";
            row.appendChild(lab);
            row.appendChild(ta);
            row.appendChild(tag);
            root.appendChild(row);
            ta.addEventListener("input", () => {
                const w = findWidget(node, "slot_" + i);
                if (w && w.value !== ta.value) w.value = ta.value;
                node._zeonScRefresh?.(false); // v0.30.1: intercepts are gone — we grow the stack ourselves
            });
        }
        const ta = row.querySelector("textarea");
        row.classList.toggle("wired", !!wired);
        ta.disabled = !!wired;
        if (!wired) {
            const w = findWidget(node, "slot_" + i);
            const v = String((w && w.value) ?? "");
            if (ta.value !== v) ta.value = v; // restore/config writes land here
        }
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
    node.setSize?.([w, node.size?.[1] || 300]);
    app.canvas?.setDirty?.(true, true);
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.StringComposer",
    setup() {
        console.info("[zeonmkii] sc: string_composer v0.30.2 online (dynamic rows + sockets)");
    },
    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        injectRowsCSS();
        ensureSlotInputs(node);

        function refresh(structural) {
            renderRows(node, root);
            if (structural) fitNode(node);
            node.setDirtyCanvas?.(true, true);
        }
        node._zeonScRefresh = refresh;

        // ＋/－ — native canvas buttons (field-proven alive). Count persists in
        // node.properties; rows appear/disappear = our DOM, no negotiation.
        const plus = node.addWidget("button", "＋ slot", null, () => {
            node.properties.zeon_slots = Math.min(MAX_SLOTS, propCount(node) + 1);
            refresh(true);
        });
        const minus = node.addWidget("button", "－ slot", null, () => {
            let n = propCount(node) - 1;
            while (n >= MIN_SLOTS && rowHasText(node, n + 1)) n--; // never shrink past a wired or filled row
            node.properties.zeon_slots = Math.max(MIN_SLOTS, n);
            refresh(true);
        });
        for (const b of [plus, minus]) {
            b.serialize = false;
            if (!b.options) b.options = {};
            b.options.serialize = false;
        }

        // screen order: separator → [hidden slots] → rows → ＋/－ (v0.30.0: preview band deleted, Boss's call)

        // The rows widget — one hosted DOM block, CharSwap geometry laws:
        // state-derived getMinHeight/getMaxHeight (never measured),
        // computeLayoutSize for Nodes 2.0, adaptive canvasOnly, zoom passthrough.
        const root = document.createElement("div");
        root.className = "z-sc-root";
        const rowsH = () => contentHeight(effectiveCount(node));
        const rowsW = node.addDOMWidget(WIDGET_NAME, "zeonmkii_sc_rows", root, {
            getValue: () => null,
            setValue: () => {},
            serialize: false,
            getMinHeight: () => rowsH(),
            getMaxHeight: () => rowsH(),
            margin: 0,
        });
        rowsW.serialize = false;
        rowsW.computeLayoutSize = () => ({ minHeight: rowsH(), minWidth: 1 });
        applyAdaptiveCanvasOnly(rowsW);
        installCanvasZoomPassthrough(root);
        node._zeonScRoot = root;

        // CharSwap's anti-shift restore guard (by-name rebuild before the
        // positional deal) + post-restore repaint.
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
                console.error("[zeonmkii] sc: restore guard failed:", e);
            }
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try {
                ensureSlotInputs(node);
                hideSlotWidgets(node);
                renderRows(node, root);
                fitNode(node);
            } catch (e) {
                console.error("[zeonmkii] sc: post-restore repaint failed:", e);
            }
            return r;
        };

        // Width floor + content-hugging height (legacy renderer only — Nodes
        // 2.0 locks size via the layout store; clamping there desyncs).
        const origResize = node.onResize;
        node.onResize = function (size) {
            return origResize ? origResize.call(this, size) : undefined;
        };

        // (v0.30.1) Value intercepts REMOVED — see the law note where the old
        // helper lived. Auto-grow rides the DOM input handler's refresh; restore
        // rides the configure wrap's renderRows. Nothing intercepts values now.

        // Wire/unwire → row swaps to the ⇦ tag through the core path only.
        const origOnConn = node.onConnectionsChange;
        node.onConnectionsChange = function (...args) {
            if (typeof origOnConn === "function") origOnConn.apply(this, args);
            refresh(true);
        };

        hideSlotWidgets(node);
        renderRows(node, root);
        fitNode(node);

        // First pass ONLY after the restore window fully settled (CharSwap law:
        // no onConfigure hook alone, no setTimeout(0) — re-assert at 100ms).
        setTimeout(() => {
            ensureSlotInputs(node);
            hideSlotWidgets(node);
            renderRows(node, root);
            fitNode(node);
        }, 100);
    },
});
