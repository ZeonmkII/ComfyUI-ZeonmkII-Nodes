/**
 * ComfyUI-ZeonmkII-Nodes — Run Timer UI
 *
 * Frontend-only stopwatch (the Python side is a noop that ComfyUI skips on
 * Run). Listens to ComfyUI's run events: execution_start resets to zero and
 * ticks live, execution_success freezes green, execution_error freezes red.
 * The last finished total is stored on node.properties so it survives tab
 * switches and reloads.
 *
 * Deliberately simple vs. Pixaroma's run timer: no chime (no sound assets),
 * no font/scale machinery, no history panel — just a clean skinned clock.
 */
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Run Timer";
const PROP_LAST_MS = "zeonTimerLastMs";
const TICK_MS = 100;

const liveNodes = new Set(); // node handles; detached entries are harmless
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

function paintAll() {
    const t = state.running ? performance.now() - state.startMs : state.frozen;
    for (const h of liveNodes) {
        h.clock.textContent = fmt(t);
        h.clock.className = "zeon-clock" + (state.running || state.status !== "idle" ? " status-" + state.status : "");
        h.status.textContent = STATUS_TEXT[state.status] || "";
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
        if (node.graph) node.properties[PROP_LAST_MS] = state.frozen; // persist only live graph nodes
    }
    paintAll();
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.RunTimer",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        ensureStyles();
        applyNodeSkin(node);

        const clock = document.createElement("div");
        clock.className = "zeon-clock";
        clock.textContent = "00:00.0";
        const status = document.createElement("div");
        status.className = "zeon-clock-status";
        status.textContent = STATUS_TEXT.idle;

        const w = node.addDOMWidget("zeon_timer", "timer", clock, {});
        w.serialize = false;
        w.element.appendChild(status);

        // restore last finished total from the saved workflow
        const last = node.properties ? node.properties[PROP_LAST_MS] : null;
        if (typeof last === "number" && last > 0 && !state.running) {
            state.frozen = last;
            state.status = "done";
            paintAll();
        }

        liveNodes.add(node);
        if (state.running || state.status !== "idle") paintAll();
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
