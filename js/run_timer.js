/**
 * ComfyUI-ZeonmkII-Nodes — Run Timer UI
 *
 * Frontend-only stopwatch (the Python side is a noop that ComfyUI skips on
 * Run). Listens to ComfyUI's run events: execution_start resets to zero and
 * ticks live, execution_success freezes green, execution_error /
 * execution_interrupted freeze red. The last finished total is stored on
 * node.properties so it survives tab switches and reloads.
 *
 * v0.9.0 FIX ("it's not running" on MAGI): the first release created the
 * clock/status elements but never attached them to the node, so the paint
 * loop read undefined.textContent and crashed on its very first tick — the
 * display froze at 00:00.0 forever. They now live on _zeonTimerHandles,
 * every per-node paint runs inside its own try (one dead node can't kill
 * the rest — Pixaroma's rule), and the widget declares getMinHeight so the
 * Vue renderer gives it a real height.
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

const STATUS_TEXT = {
    idle: "waiting for a run",
    running: "running…",
    done: "done",
    error: "error — stopped",
};

function paintNode(node) {
    const h = node._zeonTimerHandles;
    if (!h || !h.clock) return;
    const t = state.running ? performance.now() - state.startMs : state.frozen;
    h.clock.textContent = fmt(t);
    h.clock.className = "zeon-clock" + (state.status !== "idle" ? " status-" + state.status : "");
    h.status.textContent = STATUS_TEXT[state.status] || "";
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

            const root = document.createElement("div");
            const clock = document.createElement("div");
            clock.className = "zeon-clock";
            clock.textContent = "00:00.0";
            const status = document.createElement("div");
            status.className = "zeon-clock-status";
            status.textContent = STATUS_TEXT.idle;
            root.append(clock, status);

            const w = node.addDOMWidget("zeon_timer", "timer", root, {
                serialize: false,
                // hug the real, live content (number line + status line).
                // Measured, not guessed — so the widget can never reserve
                // space for content that isn't rendering.
                getMinHeight: () => Math.max(root.offsetHeight || 0, 40),
            });
            w.serialize = false;

            // hug the content: the clock is one 50px line + one status
            // line — nothing else. Shrink fresh AND loaded nodes so a
            // previously-saved bloated timer also snaps to fit on reload.
            requestAnimationFrame(() => {
                try { node.setSize(node.computeSize()); } catch (_e) {}
            });

            // THE FIX: the paint loop reads these off the node.
            node._zeonTimerHandles = { clock, status };
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
