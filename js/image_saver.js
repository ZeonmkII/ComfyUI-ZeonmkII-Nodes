/**
 * ComfyUI-ZeonmkII-Nodes — Save Image UI (v0.12.0)
 *
 * Boss spec 2026-10-02: START OVER. The Python side is ComfyUI-Image-Saver
 * vendored VERBATIM — every field stays a native hand-editable widget,
 * exactly like upstream. The only additions are Pixaroma-style:
 *   • a 📁 Browse button spliced right under the `path` widget that opens
 *     the HOST's real OS folder dialog (/zeonmkii/api/save_image/pick_folder,
 *     loopback-only; picking a folder approves it permanently — Pixaroma's
 *     trust model, ported)
 *   • a live filename preview line: filename_pattern with %width%/%height%
 *     substituted live from the widgets, %counter% shown as 00001, all
 *     other tokens left visible
 *
 * DOM-widget law: constant getMinHeight (never measured), element fills the
 * container, children built once + only text nodes updated.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Save Image";
const STYLE_ID = "zeonmkii-save-image-css";

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
.zeon-save-row { display:flex; gap:6px; align-items:center; height:100%; }
.zeon-save-btn { background:#7a1220; border:1px solid #a91d30; color:#ffd9de;
  font:600 11px system-ui; padding:3px 10px; border-radius:4px; cursor:pointer;
  white-space:nowrap; }
.zeon-save-btn:hover { background:#9c1a2c; }
.zeon-save-btn:disabled { opacity:.55; cursor:default; }
.zeon-save-msg { color:#c9c9c9; font:11px system-ui; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; min-width:0; }
.zeon-save-prev { color:#8f8f8f; font:11px ui-monospace,monospace;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
    document.head.appendChild(s);
}

/** %token% → live value where we can know it at build time */
function renderPattern(pattern, map) {
    return String(pattern || "").replace(/%([a-z_]+)%/gi, (m, k) => {
        const key = k.toLowerCase();
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m;
    });
}

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
            const patW = w("filename_pattern");
            const extW = w("extension");
            const widthW = w("width");
            const heightW = w("height");
            if (!pathW) return;

            // ── DOM widget: [📁 Browse] + message / preview lines ─────────
            const el = document.createElement("div");
            el.style.width = "100%";
            el.style.height = "100%";
            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.gap = "2px";

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

            const prev = document.createElement("div");
            prev.className = "zeon-save-prev";
            el.appendChild(row);
            el.appendChild(prev);

            const dom = node.addDOMWidget("zeon_save_browse", "zeonmkii/browse", el, {
                getMinHeight: () => 58,
            });
            dom.serialize = false;
            // splice directly under the `path` widget
            const idx = node.widgets.indexOf(pathW);
            if (idx >= 0 && idx < node.widgets.length - 1) {
                node.widgets.splice(idx + 1, 0, node.widgets.pop());
            }

            const update = () => {
                const map = {
                    width: widthW ? widthW.value : 1024,
                    height: heightW ? heightW.value : 1536,
                    counter: "00001",
                };
                const name = renderPattern(patW ? patW.value : "", map);
                const ext = String((extW && extW.value) || "png").replace(/^\./, "");
                const folder = String(pathW.value || "").trim() || "(ComfyUI output)";
                prev.textContent = name ? `${folder}/${name}.${ext}` : "set filename_pattern";
                prev.title = prev.textContent;
            };

            // refresh on edits — wrap callbacks, never replace
            for (const target of [pathW, patW, extW, widthW, heightW]) {
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
