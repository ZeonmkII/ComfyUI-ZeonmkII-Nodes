/**
 * ComfyUI-ZeonmkII-Nodes — String Composer UI (v0.25.3)
 *
 * v0.25.3: v0.25.2's hidden "number" widget fought the frontend's widget
 * pass — buttons still dead on canvas, and the ghost widget skewed the
 * toolbar layout on resize. The count now lives in node.properties
 * (LiteGraph serializes properties natively — saved workflows remember it
 * with zero hidden widgets), every refresh forces a canvas repaint
 * (setDirtyCanvas), and the toolbar CSS centers labels + tracks node width.
 *
 * Boss's shape B: one node IS the prompt stack.
 *   - unwired slot → its inline multiline box visible (type the header in)
 *   - wired slot   → box hides itself (the wire owns that slot)
 *   - ＋/－ grows the visible slot count 3 → 8 (hidden slots never render)
 *   - live preview band: the final joined prompt as you type
 *
 * Companion: nodes/text_blocks.py (join logic lives there).
 * Hide technique: the pack's proven trio — w.hidden + computeSize[0,-4] +
 * canvasOnly (ComfyUI writes measured heights back; computeSize alone does
 * NOT suppress — canvasOnly excludes from the Vue render).
 */
import { app } from "/scripts/app.js";
import { ensureStyles, makeToolbar, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII String Composer";
const MIN_SLOTS = 3;
const MAX_SLOTS = 8;

/** v0.25.1: mirror Python's decode_separator — \\n / \\t / \\\\ escapes in the
 * single-line separator box become real chars in the preview too. */
function decodeSeparator(s) {
    return s.replace(/\\\\|\\n|\\t/g, (m) => ({ "\\\\": "\\", "\\n": "\n", "\\t": "\t" }[m]));
}

/** zero-footprint hide — the pack's collapse pattern (DOM-widget law). */
function collapse(w) {
    if (!w) return;
    w.hidden = true;
    if (!w._zeonCollapsed) {
        w._zeonOrigCompute = w.computeSize;
        w.computeSize = () => [0, -4];
        w._zeonCollapsed = true;
    }
    if (!w.options) w.options = {};
    w.options.canvasOnly = true;
    const hideEl = () => { const el = w.element || w.inputEl; if (el) el.style.display = "none"; };
    hideEl();
    requestAnimationFrame(hideEl);
}

function reveal(w) {
    if (!w) return;
    w.hidden = false;
    if (w._zeonCollapsed && w._zeonOrigCompute) {
        w.computeSize = w._zeonOrigCompute;
        w._zeonCollapsed = false;
    }
    if (w.options) delete w.options.canvasOnly;
    const el = w.element || w.inputEl;
    if (el) el.style.display = "";
}

function slotWidget(node, i) {
    return (node.widgets || []).find((w) => w.name === `slot_${i}`);
}

function slotIsWired(node, i) {
    const inp = (node.inputs || []).find((inp) => inp.name === `slot_${i}`);
    return !!(inp && inp.link != null);
}

function slotCount(node) {
    // v0.25.3: the count lives in node.properties — LiteGraph serializes
    // properties into saved workflows natively. No hidden widget to fight
    // the frontend's widget pass (v0.25.2's ghost broke layout + felt dead).
    if (!node.properties) node.properties = {};
    let n = Number(node.properties.zeon_slots);
    if (!Number.isFinite(n)) n = MIN_SLOTS;
    // any wired slot beyond the count is visible on merit
    for (let i = MIN_SLOTS + 1; i <= MAX_SLOTS; i++) if (slotIsWired(node, i)) n = Math.max(n, i);
    return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, n));
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.StringComposer",
    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        const band = makeBand(node);
        const toolbar = makeToolbar(node, [
            {
                label: "＋ slot",
                title: "grow the stack (max 8)",
                onClick: () => {
                    node.properties.zeon_slots = Math.min(MAX_SLOTS, slotCount(node) + 1);
                    refresh();
                },
            },
            {
                label: "－ slot",
                title: "shrink the stack (min 3; wired slots stay)",
                onClick: () => {
                    let n = slotCount(node) - 1;
                    while (n >= MIN_SLOTS && slotIsWired(node, n + 1)) n--; // never hide a wired slot
                    node.properties.zeon_slots = Math.max(MIN_SLOTS, n);
                    refresh();
                },
            },
        ]);
        // seat the toolbar just under the separator, above the slot boxes
        // (widgets render in node.widgets order; toolbar/band are DOM widgets
        // with serialize:false — reordering them never touches widgets_values)
        const tw = node.widgets.find((w) => w.element === toolbar);
        const sepIdx = node.widgets.findIndex((w) => w.name === "separator");
        if (tw && sepIdx >= 0 && node.widgets.indexOf(tw) > sepIdx) {
            node.widgets.splice(node.widgets.indexOf(tw), 1);
            node.widgets.splice(sepIdx + 1, 0, tw);
        }

        function refresh() {
            const count = slotCount(node);
            for (let i = 1; i <= MAX_SLOTS; i++) {
                const w = slotWidget(node, i);
                if (!w) continue;
                if (i > count || slotIsWired(node, i)) collapse(w);
                else reveal(w);
            }
            node.setSize(node.computeSize());                        // height follows the boxes
            if (app.graph) app.graph.setDirtyCanvas(true, true);     // force the repaint — v0.25.3
            preview();
        }

        function preview() {
            const parts = [];
            for (let i = 1; i <= MAX_SLOTS; i++) {
                if (!slotIsWired(node, i)) {
                    const w = slotWidget(node, i);
                    const v = w && typeof w.value === "string" ? w.value.trim() : "";
                    if (v) parts.push(v);
                } else {
                    parts.push(`⇦ slot_${i}`); // wired: content arrives at run time
                }
            }
            const sepW = (node.widgets || []).find((x) => x.name === "separator");
            const sep = decodeSeparator(sepW && typeof sepW.value === "string" ? sepW.value : ", ");
            band.text.textContent = parts.length ? parts.join(sep) : "— type in a box or wire a slot —";
        }

        // live updates while typing (multiline widget's textarea)
        for (let i = 1; i <= MAX_SLOTS; i++) {
            const w = slotWidget(node, i);
            if (!w) continue;
            const orig = w.callback;
            w.callback = function (...args) {
                if (typeof orig === "function") orig.apply(this, args);
                preview();
            };
            const el = w.element || w.inputEl;
            if (el) el.addEventListener("input", preview);
        }
        const sepW = (node.widgets || []).find((x) => x.name === "separator");
        if (sepW) {
            const origSep = sepW.callback;
            sepW.callback = function (...args) {
                if (typeof origSep === "function") origSep.apply(this, args);
                preview();
            };
        }

        // wire/unwire → slot box swaps places with the wire instantly
        const origOnConn = node.onConnectionsChange;
        node.onConnectionsChange = function (...args) {
            if (typeof origOnConn === "function") origOnConn.apply(this, args);
            refresh();
        };

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (...args) {
            if (typeof origOnConfigure === "function") origOnConfigure.apply(this, args);
            requestAnimationFrame(() => {
                refresh();
                node.setSize(node.computeSize());
                if (app.graph) app.graph.setDirtyCanvas(true, true);
            });
        };

        refresh();
    },
});
