/**
 * ComfyUI-ZeonmkII-Nodes — Random Image UI (v0.16.0 rebuild)
 *
 * Boss spec (2026-10-02 + 2026-10-03): inherit Save Image's browse (never
 * build it twice), fix the broken toolbar (the old skin-toolbar rendered
 * text-outside / few-px-tall), and add a live stats band. Picking logic =
 * nodes/random_image.py, function-identical: seeded pick, no-repeat cache,
 * image + filename outputs.
 *
 * Panel layout (ONE DOM widget, image_saver's proven geometry law: 100%-
 * fill root, constant getMinHeight, children built once, splice under the
 * path widget):
 *   [📁 Browse] folder message…
 *   ▌stats band — 42 images · 17 picked · 25 left   (/random_image/stats)
 *   [🔁 No repeats] chip row  (drives exclude_selected, which hides)
 *   [🎲 Roll again] [♻ Reset cache] toolbar
 *
 * ♻ is MOMENTARY now: execution_success flips it back to false. The old
 * toolbar left reset_cache true forever, which would wipe the no-repeat
 * history on EVERY subsequent run — a silent no-repeat killer.
 */
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Random Image";
const STYLE_ID = "zeonmkii-random-image-css";

function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.zeon-ri-row { display:flex; gap:6px; align-items:center; }
.zeon-ri-btn { background:#5c0000; border:1px solid #8f1a1a; color:#f1d9d9;
  padding:4px 10px; border-radius:6px; font:12px system-ui; cursor:pointer; white-space:nowrap; }
.zeon-ri-btn:hover { background:#9c1a2c; color:#fff; }
.zeon-ri-btn:disabled { opacity:.55; cursor:default; }
.zeon-ri-msg { color:#c9c9c9; font:11px system-ui; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.zeon-ri-stats { display:flex; align-items:center; gap:6px; padding:3px 8px; border-radius:6px;
  background:#121316; border-left:3px solid #A20000; color:#e8e6e3; font-size:11px; min-height:18px; }
.zeon-ri-chips { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0; }
.zeon-ri-chip { padding:3px 8px; border:1px solid #232529; border-radius:10px; background:#1a1c20;
  color:#e8e6e3; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap; }
.zeon-ri-chip:hover { border-color:#750000; color:#fff; }
.zeon-ri-chip.active { background:#A20000; border-color:#A20000; color:#fff; }
.zeon-ri-toolbar { display:flex; gap:6px; padding:2px 0 4px 0; }
.zeon-ri-tool { flex:1 1 auto; padding:4px 8px; border:1px solid #750000; border-radius:6px;
  background:#1a1c20; color:#e8e6e3; font-size:12px; cursor:pointer; }
.zeon-ri-tool:hover { background:#750000; color:#fff; }
.zeon-ri-tool:active { background:#A20000; border-color:#A20000; color:#fff; }
`;
    document.head.appendChild(style);
}

/** zero-footprint hide — Resolution's collapse pattern (DOM-widget law:
 *  hidden + computeSize [0,-4] + canvasOnly is what actually removes the
 *  widget from the Vue/Nodes-2.0 render). */
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

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.RandomImage",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            injectCSS();
            applyNodeSkin(node);

            const dirW = node.widgets?.find((x) => x.name === "image_directory");
            const seedW = node.widgets?.find((x) => x.name === "random_seed");
            const exclW = node.widgets?.find((x) => x.name === "exclude_selected");
            const resetW = node.widgets?.find((x) => x.name === "reset_cache");
            if (!dirW || !seedW) return;
            if (exclW) collapse(exclW);

            // ── root: image_saver geometry law ──────────────────────────
            const el = document.createElement("div");
            el.style.width = "100%";
            el.style.height = "100%";
            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.gap = "4px";

            // browse row
            const row = document.createElement("div");
            row.className = "zeon-ri-row";
            const btn = document.createElement("button");
            btn.className = "zeon-ri-btn";
            btn.type = "button";
            btn.textContent = "📁 Browse";
            const msg = document.createElement("span");
            msg.className = "zeon-ri-msg";
            row.append(btn, msg);

            // stats band
            const stats = document.createElement("div");
            stats.className = "zeon-ri-stats";
            stats.textContent = "point at a folder →";

            // chip row — drives exclude_selected
            const chipsWrap = document.createElement("div");
            chipsWrap.className = "zeon-ri-chips";
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "zeon-ri-chip";
            chip.textContent = "🔁 No repeats";
            chip.title = "Skip already-picked images until the folder is exhausted, then reshuffle.";
            if (!exclW) chip.style.display = "none";
            chipsWrap.appendChild(chip);

            // toolbar — the rebuild's whole point
            const bar = document.createElement("div");
            bar.className = "zeon-ri-toolbar";
            const roll = document.createElement("button");
            roll.type = "button";
            roll.className = "zeon-ri-tool";
            roll.textContent = "🎲 Roll again";
            roll.title = "Shuffle the seed so the next run picks a different image.";
            const rst = document.createElement("button");
            rst.type = "button";
            rst.className = "zeon-ri-tool";
            rst.textContent = "♻ Reset cache";
            rst.title = "Forget the already-picked history on the next run.";
            bar.append(roll, rst);

            el.append(row, stats, chipsWrap, bar);

            const dom = node.addDOMWidget("zeon_random_panel", "zeonmkii/random", el, {
                getMinHeight: () => 132,  // CONSTANT (DOM-widget law — never measure)
            });
            dom.serialize = false;
            // splice directly under the directory widget (image_saver pattern)
            const idx = node.widgets.indexOf(dirW);
            if (idx >= 0 && idx < node.widgets.length - 1) {
                node.widgets.splice(idx + 1, 0, node.widgets.pop());
            }

            let flashT = null;
            const flash = (text, ms = 2600) => {
                msg.textContent = text;
                clearTimeout(flashT);
                flashT = setTimeout(() => { msg.textContent = ""; }, ms);
            };

            const syncChip = () => {
                if (exclW) chip.classList.toggle("active", !!exclW.value);
            };

            let statsT = null;
            const refreshStats = () => {
                clearTimeout(statsT);
                statsT = setTimeout(async () => {
                    const p = String(dirW.value || "").trim();
                    if (!p) { stats.textContent = "point at a folder →"; return; }
                    let r = {};
                    try {
                        const q = encodeURIComponent(p);
                        r = await (await fetch(`/zeonmkii/api/random_image/stats?path=${q}`)).json();
                    } catch (_e) { r = {}; }
                    if (r.ok) {
                        const left = Math.max(r.total - r.picked, 0);
                        stats.textContent = (exclW && exclW.value)
                            ? (left > 0
                                ? `${r.total} images · ${r.picked} picked · ${left} left`
                                : `${r.total} images · exhausted — reshuffles next run`)
                            : `${r.total} images · repeats allowed`;
                    } else if (r.reason === "unapproved") {
                        stats.textContent = "stats wait for one Browse (folder approval)";
                    } else if (r.reason === "missing") {
                        stats.textContent = "folder not found";
                    } else {
                        stats.textContent = "stats unavailable";
                    }
                }, 200);
            };
            node._zeonRiRefresh = refreshStats;

            // 📁 Browse — mirrors image_saver's handler flow verbatim
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = "Opening…";
                let res = { ok: false };
                try {
                    const cur = encodeURIComponent(String(dirW.value || ""));
                    const r = await fetch(`/zeonmkii/api/save_image/pick_folder?path=${cur}`);
                    res = await r.json();
                } catch (e) { res = { ok: false, message: String(e) }; }
                btn.disabled = false;
                btn.textContent = "📁 Browse";
                if (res.ok && res.path) {
                    dirW.value = res.path;
                    flash(res.remembered ? "approved ✓" : "picked (approval failed to save)");
                    refreshStats();
                } else if (res.unavailable) {
                    flash("Needs the browser on the ComfyUI machine — type the path");
                } else if (res.busy) {
                    flash("A folder dialog is already open");
                } else if (res.cancelled) {
                    /* silent */
                } else {
                    flash(res.message || "Browse failed — type the path instead");
                }
            });

            chip.addEventListener("click", () => {
                if (!exclW) return;
                exclW.value = !exclW.value;
                syncChip();
                refreshStats();
            });

            roll.addEventListener("click", () => {
                seedW.value = Math.floor(Math.random() * 0xffffffff);
                flash(`seed → ${seedW.value}`);
            });

            rst.addEventListener("click", () => {
                if (resetW) resetW.value = true;
                flash("cache clears on the next run");
            });

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const rr = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { syncChip(); refreshStats(); } catch (_e) { /* cosmetic */ }
                return rr;
            };

            syncChip();
            refreshStats();
            try { node.setSize([300, 218]); } catch (_e) { /* cosmetic */ }
        } catch (err) {
            console.error("[ZeonmkII Random Image] setup error:", err);
        }
    },
});

// momentary ♻ + post-run stats refresh — ONE module-level listener
// (timer's event pattern). Walks top-level graph nodes; subgraph members
// keep manual ♻ behavior (v1 scope note).
api.addEventListener("execution_success", () => {
    for (const n of app.graph?._nodes || []) {
        if (!n || n.comfyClass !== NODE_CLASS) continue;
        const rw = n.widgets?.find((w) => w.name === "reset_cache");
        if (rw && rw.value === true) rw.value = false;
        n._zeonRiRefresh?.();
    }
});
