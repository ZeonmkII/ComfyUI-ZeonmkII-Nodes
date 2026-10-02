/**
 * ComfyUI-ZeonmkII-Nodes — Run Timer UI
 *
 * Frontend-only stopwatch (Python side is a noop ComfyUI skips on Run).
 * Listens to ComfyUI's run events: execution_start resets to zero and
 * ticks live, execution_success freezes green, execution_error /
 * execution_interrupted freeze red. The last finished total is stored on
 * node.properties so it survives tab switches and reloads.
 *
 * v0.11.3 — rebuilt on CRT Fancy Timer's exact widget mechanics (Boss's
 * round-3 law: start from the working reference). CRT's timer is stable
 * because its element is height:100% — the element ADAPTS to whatever
 * size the widget gets and never measures itself to decide that size.
 * History of the sins this replaces:
 *   • v0.9–v0.11.1: status line appended INSIDE the clock element, then
 *     silently deleted by the first textContent write — the node reserved
 *     height for a ghost (the "empty rows below the number").
 *   • v0.11.2: getMinHeight measured live offsetHeight while ComfyUI
 *     writes the widget height back onto the element — a feedback loop
 *     that ratcheted the node to infinite height.
 * Now: ONE absolutely-centered digit element in a fill container. No
 * status line (state shows in digit color: crimson running / green done /
 * red error / default idle), no height math, nothing to feed back.
 */
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Run Timer";
const PROP_LAST_MS = "zeonTimerLastMs";
const TICK_MS = 100;

const liveNodes = new Set();
const state = { running: false, startMs: 0, frozen: 0, status: "idle" };
let ticker = null;

function fmt(ms) {
    const tenths = Math.floor(ms / 100) % 10;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + tenths;
}

function paintNode(node) {
    const clock = node._zeonTimerClock;
    if (!clock) return;
    const t = state.running ? performance.now() - state.startMs : state.frozen;
    clock.textContent = fmt(t);
    clock.className = "zeon-clock" + (state.status !== "idle" ? " status-" + state.status : "");
}

function paintAll() {
    for (const node of liveNodes) {
        try { paintNode(node); } catch (_e) { /* never let one node kill the loop */ }
    }
}

function ensureTicker(on) {
    if (on && !ticker) ticker = setInterval(paintAll, TICK_MS);
    else if (!on && ticker) { clearInterval(ticker); ticker = null; }
}

function finish(error) {
    if (!state.running) return;
    state.running = false;
    state.frozen = performance.now() - state.startMs;
    state.status = error ? "error" : "done";
    ensureTicker(false);
    for (const node of liveNodes) {
        try { if (node.graph) node.properties[PROP_LAST_MS] = state.frozen; } catch (_e) {}
    }
    paintAll();
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.RunTimer",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            // CRT Fancy Timer structure, verbatim idea: a container that
            // fills whatever space the widget gets (width/height 100%,
            // position relative), digits absolutely centered inside.
            // No getMinHeight, no measuring, no shrink games — the layout
            // has nothing to feed back, so it cannot loop or drift.
            const root = document.createElement("div");
            root.className = "zeon-timer-root";
            const clock = document.createElement("div");
            clock.className = "zeon-clock";
            clock.textContent = "00:00.0";
            root.appendChild(clock);

            const w = node.addDOMWidget("zeon_timer", "timer", root, {
                serialize: false,
                // CONSTANT floor only (a constant can't ratchet — the
                // v0.11.2 lesson) so even a very short node keeps the
                // digits mostly visible.
                getMinHeight: () => 70,
            });
            w.serialize = false;

            // First-add size: one-time constants — wide enough for the
            // digits, tall enough that the bottom edge (and its resize
            // handles) sit clearly BELOW the number. Nothing measured,
            // nothing to feed back. User resize stays free afterwards.
            try { node.setSize([330, 130]); } catch (_e) {}

            node._zeonTimerClock = clock;
            liveNodes.add(node);

            // drop our handle when the node leaves the canvas (delete,
            // workflow switch) so the loop never paints a dead node
            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                liveNodes.delete(node);
                return origOnRemoved ? origOnRemoved.apply(this, arguments) : undefined;
            };

            // restore last finished total from the saved workflow
            const last = node.properties ? node.properties[PROP_LAST_MS] : null;
            if (typeof last === "number" && last > 0 && !state.running) {
                state.frozen = last;
                state.status = "done";
            }
            paintNode(node);
        } catch (err) {
            console.error("[ZeonmkII Run Timer] setup error:", err);
        }
    },
});

api.addEventListener("execution_start", () => {
    state.running = true;
    state.startMs = performance.now();
    state.status = "running";
    ensureTicker(true);
    paintAll();
});
api.addEventListener("execution_success", () => finish(false));
api.addEventListener("execution_error", () => finish(true));
api.addEventListener("execution_interrupted", () => finish(true));
