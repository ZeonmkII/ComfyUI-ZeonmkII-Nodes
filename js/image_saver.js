/**
 * ComfyUI-ZeonmkII-Nodes — Save Image UI (v0.11.0)
 *
 * Pixaroma's layout language with our skin, minus the preview section:
 * ONE "SAVE" panel above the naming widgets — token chip buttons that
 * insert into the filename pattern, ✕ Clear, ↺ Reset, and a live
 * "will save as" line. The long Image-Saver option list lives as the
 * node's widgets + wire-in slots (Python side); this panel is the fast
 * face for naming. All widgets stay the serialized truth.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeBand } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Save Image";

const TOKENS = ["%date", "%time", "%seed", "%counter", "%model", "%basemodelname",
    "%width", "%height", "%sampler_name", "%steps", "%cfg", "%scheduler_name",
    "%denoise", "%clip_skip", "%custom", "%label"];

function nowStr(fmt) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    if (fmt) {
        // minimal strftime mirror for the common %time_format default
        return fmt.replace(/%Y/g, d.getFullYear()).replace(/%m/g, p(d.getMonth() + 1))
            .replace(/%d/g, p(d.getDate())).replace(/%H/g, p(d.getHours()))
            .replace(/%M/g, p(d.getMinutes())).replace(/%S/g, p(d.getSeconds()));
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function baseName(v) {
    const s = String(v ?? "");
    const b = s.split("/").pop();
    return b.replace(/\.(safetensors|ckpt|pt|bin|gguf)$/i, "");
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.SaveImage",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const filenameW = node.widgets.find((x) => x.name === "filename");
            const pathW = node.widgets.find((x) => x.name === "path");
            const extW = node.widgets.find((x) => x.name === "extension");
            const timeFmtW = node.widgets.find((x) => x.name === "time_format");
            if (!filenameW) return;

            const panel = document.createElement("div");
            panel.style.cssText = "padding:4px 8px 2px 8px;";

            const label = document.createElement("div");
            label.className = "zeon-rowlabel";
            label.textContent = "SAVE — FILENAME BUILDER";
            panel.appendChild(label);

            const chiprow = document.createElement("div");
            chiprow.className = "zeon-chiprow";
            panel.appendChild(chiprow);

            const prev = document.createElement("div");
            prev.className = "zeon-preview";
            panel.appendChild(prev);

            const band = makeBand(node);

            const w = node.addDOMWidget("zeon_save_panel", "panel", panel, {
                serialize: false,
                getMinHeight: () => 84,
            });
            w.serialize = false;
            const idx = node.widgets.indexOf(filenameW);
            if (idx >= 0) {
                node.widgets.splice(node.widgets.indexOf(w), 1);
                node.widgets.splice(idx, 0, w);
            }

            function insertToken(tok) {
                const cur = String(filenameW.value ?? "");
                filenameW.value = cur.endsWith(tok) ? cur : (cur ? cur + tok : tok);
            }

            for (const tok of TOKENS) {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "zeon-chip";
                chip.textContent = tok.replace("%", "");
                chip.title = "Insert " + tok + " into the filename pattern";
                chip.addEventListener("click", (e) => { e.stopPropagation(); insertToken(tok); });
                chiprow.appendChild(chip);
            }
            const clear = document.createElement("button");
            clear.type = "button";
            clear.className = "zeon-chip";
            clear.textContent = "✕ Clear";
            clear.title = "Empty the filename pattern";
            clear.addEventListener("click", (e) => { e.stopPropagation(); filenameW.value = ""; update(); });
            chiprow.appendChild(clear);
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "zeon-chip";
            reset.textContent = "↺ Reset";
            reset.title = "Restore the default filename pattern";
            reset.addEventListener("click", (e) => {
                e.stopPropagation();
                filenameW.value = "%time_%basemodelname_%seed";
                update();
            });
            chiprow.appendChild(reset);

            function update() {
                let s = String(filenameW.value ?? "");
                const fmt = timeFmtW ? String(timeFmtW.value ?? "") : "";
                s = s.replace(/%time_format<([^>]*)>/g, (_m, f) => nowStr(f));
                s = s.replace(/%date/g, nowStr());
                s = s.replace(/%time/g, nowStr(fmt || "%Y-%m-%d-%H%M%S").replace(/-/g, "").slice(0) );
                s = s.replace(/%basemodelname/g, baseName("model.safetensors") === "model" ? "<model>" : "<model>");
                for (const t of ["%seed", "%counter", "%width", "%height", "%sampler_name", "%steps",
                    "%cfg", "%scheduler_name", "%denoise", "%clip_skip", "%custom", "%label", "%model"]) {
                    s = s.split(t).join("<" + t.slice(1) + ">");
                }
                prev.textContent = "→ " + (s || "<empty>") + "." + String(extW ? extW.value : "png");
                const folder = pathW && String(pathW.value || "").trim();
                band.text.textContent = "output/" + (folder ? folder + "/" : "") + (String(filenameW.value).trim() ? "…pattern set" : "default name");
            }
            node._zeonSaveSync = update;

            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                try { update(); } catch (_e) {}
                return r;
            };

            update();
        } catch (err) {
            console.error("[ZeonmkII Save Image] setup error:", err);
        }
    },
});
