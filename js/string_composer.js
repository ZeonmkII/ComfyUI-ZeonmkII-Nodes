/**
 * ComfyUI-ZeonmkII-Nodes — String Composer UI (v0.25.5)
 *
 * v0.25.5: the growth/hide machinery is retired. Field evidence (Boss's
 * 16:13 console paste): the state side was perfect — clicks fired, counts
 * moved, floor held — but the multiline textareas ignored hidden/display
 * flips entirely (the Vue frontend renders them without reacting to
 * out-of-band widget mutations; combos hid fine for weeks, textareas
 * never did). So: all 8 slots are ALWAYS visible; wiring a slot goes
 * through ComfyUI's NATIVE convert-to-input, which removes the box
 * through the core path — hide-when-wired, for real, done by core
 * itself. Empty boxes skip silently at join (Python side, unchanged).
 *
 * Boss's shape B: one node IS the prompt stack.
 *   - 8 slot boxes: type in what you need, leave the rest empty
 *   - need a wire? convert slot to input (native) — box becomes a socket
 *   - live preview band: the final joined prompt as you type
 *
 * Companion: nodes/text_blocks.py (join logic lives there).
 */
import { app } from "/scripts/app.js";
import { makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII String Composer";
const MAX_SLOTS = 8;

/** Mirror Python's decode_separator — \n / \t / \\ escapes in the
 * single-line separator box become real chars in the preview too. */
function decodeSeparator(s) {
    return s.replace(/\\\\|\\n|\\t/g, (m) => ({ "\\\\": "\\", "\\n": "\n", "\\t": "\t" }[m]));
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.StringComposer",
    setup() {
        console.info("[zeonmkii] sc: string_composer v0.25.5 online (static 8-slot)");
    },
    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;

        const band = makeBand(node);

        function slotWidget(n, i) {
            return (n.widgets || []).find((w) => w.name === `slot_${i}`);
        }
        function slotIsWired(n, i) {
            const inp = (n.inputs || []).find((x) => x.name === `slot_${i}`);
            return !!(inp && inp.link != null);
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

        // live updates while typing / separator edits
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

        const origOnConn = node.onConnectionsChange;
        node.onConnectionsChange = function (...args) {
            if (typeof origOnConn === "function") origOnConn.apply(this, args);
            preview();
        };

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (...args) {
            if (typeof origOnConfigure === "function") origOnConfigure.apply(this, args);
            requestAnimationFrame(preview);
        };

        preview();
    },
});
