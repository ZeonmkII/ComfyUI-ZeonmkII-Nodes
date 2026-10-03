/**
 * ComfyUI-ZeonmkII-Nodes — Save Image UI (v0.12.1)
 *
 * Boss spec 2026-10-02: Image Saver (vendored verbatim, every field a native
 * hand-editable widget) + Pixaroma's detailed customizable naming convention
 * in one node. At the browse button:
 *   • token chips (Pixaroma save_image CHIPS pattern, ported): click inserts
 *     the token into `filename` at the cursor, plus ✕ Clear / ↺ Reset
 *   • live preview renders the pattern exactly the way Python's make_pathname
 *     will: same substitution order, same single-% tokens — everything the
 *     node knows (width/height/seed/steps/cfg/model/…) fills live, date/time
 *     from the clock, run-time-only values stay visible as tokens
 *   • 📁 Browse — native OS folder dialog on the ComfyUI host; picking a
 *     folder approves it permanently (Pixaroma trust model, ported)
 *
 * DOM-widget law: constant getMinHeight (never measured), element fills the
 * container, children built once + only text nodes updated.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Save Image";
const STYLE_ID = "zeonmkii-save-image-css";
const DEFAULT_PATTERN = "%time_%basemodelname_%seed";

// Pixaroma's chip set, adapted: these insert IMAGE SAVER's real tokens
// (single-% style, resolved by nodes/image_saver.py make_pathname).
const CHIPS = [
    { label: "+ Date", tok: "%date", title: "Save date (YYYY-MM-DD)" },
    { label: "+ Time", tok: "%time", title: "Save timestamp — format comes from the time_format field" },
    { label: "+ Seed", tok: "%seed", title: "Seed (from the seed_value field)" },
        { label: "+ Width", tok: "%width", title: "Image width in pixels" },
    { label: "+ Height", tok: "%height", title: "Image height in pixels" },
    { label: "+ Model", tok: "%model", title: "Checkpoint filename (from the modelname field)" },
    { label: "+ Base model", tok: "%basemodelname", title: "Checkpoint name without extension" },
    { label: "+ Sampler", tok: "%sampler_name", title: "Sampler name" },
    { label: "+ Steps", tok: "%steps", title: "Step count" },
    { label: "+ CFG", tok: "%cfg", title: "CFG scale" },
    { label: "+ Scheduler", tok: "%scheduler_name", title: "Scheduler name" },
    { label: "+ Denoise", tok: "%denoise", title: "Denoise strength" },
    { label: "+ Clip skip", tok: "%clip_skip", title: "CLIP skip" },
        ];

// The widget names whose values the preview can substitute live.
const LIVE_FIELDS = [
    "filename", "path", "extension", "width", "height", "seed_value",
    "time_format", "modelname", "denoise", "clip_skip",
    "1st_sampler_name", "1st_scheduler_name", "1st_steps", "1st_cfg",
    "2nd_sampler_name", "2nd_scheduler_name", "2nd_steps", "2nd_cfg",
];

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
.zeon-save-row { display:flex; gap:6px; align-items:center; }
.zeon-save-btn { background:#5c0000; border:1px solid #8f1a1a; color:#f1d9d9;
  font:600 11px system-ui; padding:3px 10px; border-radius:4px; cursor:pointer;
  white-space:nowrap; }
.zeon-save-btn:hover { background:#9c1a2c; }
.zeon-save-btn:disabled { opacity:.55; cursor:default; }
.zeon-save-msg { color:#c9c9c9; font:11px system-ui; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; min-width:0; }
.zeon-save-chips { display:flex; flex-wrap:wrap; gap:3px; align-items:center; }
.zeon-save-chip { background:#131313; border:1px solid #262626; color:#ddd;
  font:10px system-ui; padding:2px 7px; border-radius:9px; cursor:pointer;
  white-space:nowrap; }
.zeon-save-chip:hover { border-color:#8f1a1a; color:#f1d9d9; }
.zeon-save-prev { color:#8f8f8f; font:11px ui-monospace,monospace;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
    document.head.appendChild(s);
}

/** tiny strftime for the preview (same codes Python's time_format uses) */
function nowFmt(fmt) {
    const d = new Date();
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const map = {
        "%Y": String(d.getFullYear()), "%y": String(d.getFullYear()).slice(-2),
        "%m": pad(d.getMonth() + 1), "%d": pad(d.getDate()),
        "%H": pad(d.getHours()), "%M": pad(d.getMinutes()), "%S": pad(d.getSeconds()),
    };
    return String(fmt).replace(/%[A-Za-z%]/g, (c) => (c in map ? map[c] : ""));
}

const basename = (v) => String(v).split(/[\\/]/).pop();
const basenameNoExt = (v) => {
    const b = basename(v);
    const i = b.lastIndexOf(".");
    return i > 0 ? b.slice(0, i) : b;
};

app.registerExtension({
    name: "ZeonmkII.SaveImage",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_CLASS) return;
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);
            const node = this;
            ensureStyles();
            applyNodeSkin(node);
            injectStyles();

            const w = (name) => node.widgets?.find((x) => x.name === name);
            const pathW = w("path");
            const patW = w("filename");
            const extW = w("extension");
            if (!pathW || !patW) return;

            const val = (name) => {
                const wg = w(name);
                if (!wg || wg.value == null) return null;
                const s = String(wg.value);
                return s === "" ? null : s;
            };

            /** preview = make_pathname's exact substitution order */
            const renderPreview = (pattern) => {
                let s = String(pattern || "");
                // custom formats first — exactly like make_pathname
                s = s.replace(/%time_format<([^>]*)>/g, (m, f) => nowFmt(f));
                s = s.replace(/%counter<(\d+)>/g, (m, n) => "1".padStart(parseInt(n, 10) || 1, "0"));
                const subs = [
                    ["%date", () => nowFmt("%Y-%m-%d")],
                    ["%time", () => nowFmt(val("time_format") || "%Y-%m-%d-%H%M%S")],
                    ["%model", () => { const v = val("modelname"); return v === null ? null : basename(v); }],
                    ["%width", () => val("width")],
                    ["%height", () => val("height")],
                    ["%seed", () => val("seed_value")],
                    ["%counter", () => "00001"],
                    ["%sampler_name", () => val("sampler_name")],
                    ["%steps", () => val("steps")],
                    ["%cfg", () => val("cfg")],
                    ["%scheduler_name", () => val("scheduler_name")],
                    ["%basemodelname", () => { const v = val("modelname"); return v === null ? null : basenameNoExt(v); }],
                    ["%denoise", () => val("denoise")],
                    ["%clip_skip", () => val("clip_skip")],
                    ["%custom", () => val("custom")],
                    ["%label", () => val("label")],
                ];
                for (const [tok, fn] of subs) {
                    const r = fn();
                    if (r !== null) s = s.split(tok).join(r); // plain replace, like Python
                }
                return s;
            };

            // ── DOM widget: browse row + token chips + preview line ────────
            const el = document.createElement("div");
            el.style.width = "100%";
            el.style.height = "100%";
            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.gap = "4px";

            const row = document.createElement("div");
            row.className = "zeon-save-row";
            const btn = document.createElement("button");
            btn.className = "zeon-save-btn";
            btn.type = "button";
            btn.textContent = "📁 Browse";
            const msg = document.createElement("span");
            msg.className = "zeon-save-msg";
            row.appendChild(btn);
            row.appendChild(msg);

            const chipsWrap = document.createElement("div");
            chipsWrap.className = "zeon-save-chips";

            const prev = document.createElement("div");
            prev.className = "zeon-save-prev";
            el.appendChild(row);
            el.appendChild(chipsWrap);
            el.appendChild(prev);

            const dom = node.addDOMWidget("zeon_save_browse", "zeonmkii/browse", el, {
                getMinHeight: () => 178,
            });
            dom.serialize = false;
            // splice directly under the `path` widget
            const idx = node.widgets.indexOf(pathW);
            if (idx >= 0 && idx < node.widgets.length - 1) {
                node.widgets.splice(idx + 1, 0, node.widgets.pop());
            }

            const update = () => {
                const name = renderPreview(patW.value);
                const ext = String((extW && extW.value) || "png").replace(/^\./, "");
                const folder = String(pathW.value || "").trim() || "(ComfyUI output)";
                prev.textContent = name ? `${folder}/${name}.${ext}` : "set filename";
                prev.title = prev.textContent;
            };

            // refresh on edits — wrap callbacks, never replace
            for (const fieldName of LIVE_FIELDS) {
                const target = w(fieldName);
                if (!target) continue;
                const orig = target.callback;
                target.callback = function (...a) {
                    try { orig?.apply(this, a); } catch (e) { /* keep ours */ }
                    update();
                };
            }

            let flashT = null;
            const flash = (text, ms = 2600) => {
                msg.textContent = text;
                clearTimeout(flashT);
                flashT = setTimeout(() => { msg.textContent = ""; }, ms);
            };

            /** Pixaroma insertToken, adapted to the native widget:
             *  at the caret when its input is focused, else appended. */
            const insertTok = (tok) => {
                const cur = String(patW.value ?? "");
                const input = patW.inputEl || (patW.element?.querySelector?.("input"));
                let s = cur.length, e = cur.length;
                if (input && document.activeElement === input && typeof input.selectionStart === "number") {
                    s = input.selectionStart;
                    e = input.selectionEnd;
                }
                // smart separator (Boss 22:49): "_%seed" chains readably —
                // only add the "_" when the string does not already end in one
                const before = cur.slice(0, s);
                const ins = (before.length > 0 && !/[_/]$/.test(before) ? "_" : "") + tok;
                patW.value = before + ins + cur.slice(e);
                try { patW.callback?.(); } catch (err) { /* callback optional */ }
                try { input?.focus?.(); } catch (err) { /* fine */ }
                update();
            };

            for (const c of CHIPS) {
                const chip = document.createElement("button");
                chip.className = "zeon-save-chip";
                chip.type = "button";
                chip.textContent = c.label;
                chip.title = c.title;
                chip.addEventListener("click", () => insertTok(c.tok));
                chipsWrap.appendChild(chip);
            }
            const clearChip = document.createElement("button");
            clearChip.className = "zeon-save-chip";
            clearChip.type = "button";
            clearChip.textContent = "✕ Clear";
            clearChip.title = "Empty the filename field";
            clearChip.addEventListener("click", () => {
                patW.value = "";
                try { patW.callback?.(); } catch (err) { /* callback optional */ }
                update();
            });
            chipsWrap.appendChild(clearChip);
            const resetChip = document.createElement("button");
            resetChip.className = "zeon-save-chip";
            resetChip.type = "button";
            resetChip.textContent = "↺ Reset";
            resetChip.title = "Restore the default filename pattern";
            resetChip.addEventListener("click", () => {
                patW.value = DEFAULT_PATTERN;
                try { patW.callback?.(); } catch (err) { /* callback optional */ }
                update();
            });
            chipsWrap.appendChild(resetChip);

            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = "Opening…";
                let res = { ok: false };
                try {
                    const cur = encodeURIComponent(String(pathW.value || ""));
                    const r = await fetch(`/zeonmkii/api/save_image/pick_folder?path=${cur}`);
                    res = await r.json();
                } catch (e) { res = { ok: false, message: String(e) }; }
                btn.disabled = false;
                btn.textContent = "📁 Browse";
                if (res.ok && res.path) {
                    pathW.value = res.path;
                    flash(res.remembered ? "approved ✓" : "picked (approval failed to save)");
                    update();
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

            update();
        };
    },
});
