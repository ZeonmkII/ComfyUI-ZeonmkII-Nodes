/**
 * ComfyUI-ZeonmkII-Nodes — String Composer UI (v0.25.0)
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

function visibleSlotCount(node) {
    const w = (node.widgets || []).find((w) => w.name === "zeon_slots");
    let n = w ? Number(w.value) : MIN_SLOTS;
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
                    const w = (node.widgets || []).find((x) => x.name === "zeon_slots");
                    if (w) { w.value = Math.min(MAX_SLOTS, Number(w.value) + 1); refresh(); }
                },
            },
            {
                label: "－ slot",
                title: "shrink the stack (min 3; wired slots stay)",
                onClick: () => {
                    const w = (node.widgets || []).find((x) => x.name === "zeon_slots");
                    if (w) {
                        let n = Number(w.value) - 1;
                        while (n >= MIN_SLOTS && slotIsWired(node, n + 1)) n--; // never hide a wired slot
                        if (n < MIN_SLOTS) n = MIN_SLOTS;
                        w.value = n;
                        refresh();
                    }
                },
            },
        ]);
        toolbar.style.order = "-1"; // chips above the boxes

        function refresh() {
            const count = visibleSlotCount(node);
            for (let i = 1; i <= MAX_SLOTS; i++) {
                const w = slotWidget(node, i);
                if (!w) continue;
                if (i > count || slotIsWired(node, i)) collapse(w);
                else reveal(w);
            }
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
            band.text.textContent = parts.length ? parts.join(sepW ? sepW.value : ", ") : "— type in a box or wire a slot —";
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
            requestAnimationFrame(() => { refresh(); node.setSize(node.computeSize()); });
        };

        refresh();
    },
});
