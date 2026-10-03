/**
 * ComfyUI-ZeonmkII-Nodes — Random Prompt UI (v0.17.0)
 *
 * Port of Boss's classic random_prompt_loader_v3, wearing the pack's skin
 * and the Load Random Image rebuild's language (same browse + stats band +
 * route-driven ♻; Roll again has no place here — he wires the global seed
 * into random_seed, same as Random Image).
 *
 * Panel layout (ONE DOM widget, image_saver geometry law):
 *   [📄 Single file] [📁 Folder]        ← mode chips (combo hides)
 *   [🎲 Random] [🔁 Tracked] [➡️ Seq]   ← selection_mode chips (combo hides)
 *   [📁 Browse] folder message…
 *   ▌stats band — 42 prompts · 17 used · 25 left
 *   [♻ Reset cache]                     ← deletes the cache NOW (route)
 *
 * Deliberate port changes (flagged to Boss): PURE SEED (v3 mixed in
 * time.time_ns(), breaking reproducibility) and NO reset_cache input
 * (v0.16.1 design — the sticky-boolean failure mode can't exist).
 */
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Random Prompt";
const STYLE_ID = "zeonmkii-random-prompt-css";

function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // same proven geometry as random_image.js — scoped names
    style.textContent = `
.zeon-rp-row { display:flex; gap:6px; align-items:center; }
.zeon-rp-btn { background:#5c0000; border:1px solid #8f1a1a; color:#f1d9d9;
  padding:4px 10px; border-radius:6px; font:12px system-ui; cursor:pointer; white-space:nowrap; }
.zeon-rp-btn:hover { background:#9c1a2c; color:#fff; }
.zeon-rp-btn:disabled { opacity:.55; cursor:default; }
.zeon-rp-msg { color:#c9c9c9; font:11px system-ui; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.zeon-rp-stats { display:flex; align-items:center; gap:6px; padding:3px 8px; border-radius:6px;
  background:#121316; border-left:3px solid #A20000; color:#e8e6e3; font-size:11px; min-height:18px; }
.zeon-rp-chips { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0; }
.zeon-rp-chip { padding:3px 8px; border:1px solid #232529; border-radius:10px; background:#1a1c20;
  color:#e8e6e3; font-size:11px; cursor:pointer; user-select:none; white-space:nowrap; }
.zeon-rp-chip:hover { border-color:#750000; color:#fff; }
.zeon-rp-chip.active { background:#A20000; border-color:#A20000; color:#fff; }
.zeon-rp-toolbar { display:flex; gap:6px; padding:2px 0 4px 0; }
.zeon-rp-tool { flex:1 1 auto; padding:4px 8px; border:1px solid #750000; border-radius:6px;
  background:#1a1c20; color:#e8e6e3; font-size:12px; cursor:pointer; }
.zeon-rp-tool:hover { background:#750000; color:#fff; }
.zeon-rp-tool:active { background:#A20000; border-color:#A20000; color:#fff; }
`;
    document.head.appendChild(style);
}

/** zero-footprint hide — Resolution's collapse pattern (DOM-widget law). */
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

function mkChip(label, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "zeon-rp-chip";
    b.textContent = label;
    b.title = title;
    return b;
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.RandomPrompt",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            injectCSS();
            applyNodeSkin(node);

            const modeW = node.widgets?.find((x) => x.name === "mode");
            const pathW = node.widgets?.find((x) => x.name === "path");
            const selW = node.widgets?.find((x) => x.name === "selection_mode");
            if (!modeW || !pathW || !selW) return;
            collapse(modeW);   // chips drive it
            collapse(selW);    // chips drive it

            // ── root: image_saver geometry law ──────────────────────────
            const el = document.createElement("div");
            el.style.width = "100%";
            el.style.height = "100%";
            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.gap = "4px";

            // mode chips
            const modeRow = document.createElement("div");
            modeRow.className = "zeon-rp-chips";
            const mkModeChip = (label, value, title) => {
                const c = mkChip(label, title);
                c.addEventListener("click", () => { modeW.value = value; syncAll(); });
                modeRow.appendChild(c);
                return c;
            };
            const modeChips = {
                single_file: mkModeChip("📄 Single file", "single_file", "One prompt per line in a text file."),
                folder: mkModeChip("📁 Folder", "folder", "One prompt per .txt file in a folder."),
            };

            // selection_mode chips
            const selRow = document.createElement("div");
            selRow.className = "zeon-rp-chips";
            const mkSelChip = (label, value, title) => {
                const c = mkChip(label, title);
                c.addEventListener("click", () => { selW.value = value; syncAll(); });
                selRow.appendChild(c);
                return c;
            };
            const selChips = {
                random: mkSelChip("🎲 Random", "random", "Any prompt each run (seeded)."),
                tracked_random: mkSelChip("🔁 Tracked", "tracked_random", "No repeats until everything is used once, then reshuffle."),
                sequential: mkSelChip("➡️ Sequential", "sequential", "Walk the prompts in order."),
            };

            // browse row
            const row = document.createElement("div");
            row.className = "zeon-rp-row";
            const btn = document.createElement("button");
            btn.className = "zeon-rp-btn";
            btn.type = "button";
            btn.textContent = "📁 Browse";
            const msg = document.createElement("span");
            msg.className = "zeon-rp-msg";
            row.append(btn, msg);

            // stats band
            const stats = document.createElement("div");
            stats.className = "zeon-rp-stats";
            stats.textContent = "point at a file or folder →";

            // toolbar — ♻ only (seed wiring makes a Roll button pointless)
            const bar = document.createElement("div");
            bar.className = "zeon-rp-toolbar";
            const rst = document.createElement("button");
            rst.type = "button";
            rst.className = "zeon-rp-tool";
            rst.textContent = "♻ Reset cache";
            rst.title = "Forget the already-used history immediately.";
            bar.appendChild(rst);

            el.append(modeRow, selRow, row, stats, bar);

            const dom = node.addDOMWidget("zeon_prompt_panel", "zeonmkii/prompt", el, {
                getMinHeight: () => 158,  // CONSTANT (DOM-widget law — never measure)
            });
            dom.serialize = false;
            // splice directly under the path widget (image_saver pattern)
            const idx = node.widgets.indexOf(pathW);
            if (idx >= 0 && idx < node.widgets.length - 1) {
                node.widgets.splice(idx + 1, 0, node.widgets.pop());
            }

            let flashT = null;
            const flash = (text, ms = 2600) => {
                msg.textContent = text;
                clearTimeout(flashT);
                flashT = setTimeout(() => { msg.textContent = ""; }, ms);
            };

            const syncChips = () => {
                for (const [v, c] of Object.entries(modeChips)) c.classList.toggle("active", modeW.value === v);
                for (const [v, c] of Object.entries(selChips)) c.classList.toggle("active", selW.value === v);
            };

            const q = () =>
                `path=${encodeURIComponent(String(pathW.value || "").trim())}&mode=${encodeURIComponent(String(modeW.value || "single_file"))}`;

            let statsT = null;
            const refreshStats = () => {
                clearTimeout(statsT);
                statsT = setTimeout(async () => {
                    const p = String(pathW.value || "").trim();
                    if (!p) { stats.textContent = "point at a file or folder →"; return; }
                    let r = {};
                    try {
                        r = await (await fetch(`/zeonmkii/api/random_prompt/stats?${q()}`)).json();
                    } catch (_e) { r = {}; }
                    if (r.ok) {
                        const left = Math.max(r.total - r.picked, 0);
                        stats.textContent = (selW.value === "random")
                            ? `${r.total} prompts · repeats allowed`
                            : (left > 0
                                ? `${r.total} prompts · ${r.picked} used · ${left} left`
                                : `${r.total} prompts · exhausted — reshuffles next run`);
                    } else if (r.reason === "unapproved") {
                        stats.textContent = "stats wait for one Browse (approval)";
                    } else if (r.reason === "missing") {
                        stats.textContent = "file/folder not found";
                    } else {
                        stats.textContent = "stats unavailable";
                    }
                }, 200);
            };
            node._zeonRpRefresh = refreshStats;
            const syncAll = () => { syncChips(); refreshStats(); };

            // 📁 Browse — image_saver flow. Folder mode browses directories;
            // single_file mode also opens the FOLDER dialog, Boss picks the
            // folder then types/edits the filename (OS file dialogs for
            // arbitrary files are the same trust cost for less control).
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = "Opening…";
                let res = { ok: false };
                try {
                    const r = await fetch(`/zeonmkii/api/save_image/pick_folder?path=${encodeURIComponent(String(pathW.value || ""))}`);
                    res = await r.json();
                } catch (e) { res = { ok: false, message: String(e) }; }
                btn.disabled = false;
                btn.textContent = "📁 Browse";
                if (res.ok && res.path) {
                    pathW.value = res.path;
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

            rst.addEventListener("click", async () => {
                const p = String(pathW.value || "").trim();
                if (!p) { flash("point at a file or folder first"); return; }
                rst.disabled = true;
                let res = {};
                try {
                    res = await (await fetch(`/zeonmkii/api/random_prompt/reset?${q()}`)).json();
                } catch (_e) { res = {}; }
                rst.disabled = false;
                if (res.ok) {
                    flash("cache cleared ✓");
                    refreshStats();
                } else {
                    flash("reset failed — try again");
                }
            });

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const rr = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { syncAll(); } catch (_e) { /* cosmetic */ }
                return rr;
            };

            syncAll();
            try { node.setSize([300, 246]); } catch (_e) { /* cosmetic */ }
        } catch (err) {
            console.error("[ZeonmkII Random Prompt] setup error:", err);
        }
    },
});

// post-run stats refresh — ONE module-level listener (timer's pattern)
api.addEventListener("execution_success", () => {
    for (const n of app.graph?._nodes || []) {
        if (!n || n.comfyClass !== NODE_CLASS) continue;
        n._zeonRpRefresh?.();
    }
});
