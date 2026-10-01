/**
 * ComfyUI-ZeonmkII-Nodes — Save Image UI
 *
 * v0.9.0: the rich naming panel. The native widgets carry every option
 * (folder, format, quality, embed toggles — the Image-Saver option set);
 * this UI adds what a plain text field can't: one-click TOKEN BUTTONS that
 * build the filename pattern, and a live preview of the resolved name.
 * Token semantics mirror nodes/image_saver.py exactly.
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Save Image";

const TOKEN_GROUPS = [
    ["naming", [
        ["📅 date", "%date%"], ["⏱ time", "%time%"],
        ["🔢 counter", "%counter%"], ["🎲 seed", "%seed%"],
    ]],
    ["info", [
        ["steps", "%steps%"], ["cfg", "%cfg%"], ["sampler", "%sampler%"],
        ["scheduler", "%scheduler%"], ["model", "%model%"],
        ["📐 WxH", "%width%x%height%"],
    ]],
];

const SAMPLE = {
    "%date%": "2026-10-01", "%time%": "143025", "%seed%": "123456789",
    "%steps%": "28", "%cfg%": "3.5", "%sampler%": "euler", "%scheduler%": "beta",
    "%model%": "krea2", "%width%": "1536", "%height%": "640",
};

// mirror of expand_tokens() in nodes/image_saver.py
function previewName(pattern, ext) {
    let s = String(pattern || "Zeon_%date%_%counter%").replace("%counter%", "");
    for (const [k, v] of Object.entries(SAMPLE)) s = s.split(k).join(v);
    s = s.replace(/[\s_]+$/, "").trim();
    if (!s) s = "Zeon";
    return s + "_00001_." + (ext || "png");
}

function interceptWidgetValue(widget, onChange) {
    let widgetValue = widget.value;
    const desc =
        Object.getOwnPropertyDescriptor(widget, "value") ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(widget), "value");
    Object.defineProperty(widget, "value", {
        configurable: true,
        enumerable: true,
        get() { return desc && desc.get ? desc.get.call(widget) : widgetValue; },
        set(newVal) {
            if (desc && desc.set) desc.set.call(widget, newVal);
            else widgetValue = newVal;
            onChange(newVal);
        },
    });
}

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.SaveImage",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        try {
            ensureStyles();
            applyNodeSkin(node);

            const nameW = node.widgets ? node.widgets.find((w) => w.name === "filename") : null;
            const extW = node.widgets ? node.widgets.find((w) => w.name === "extension") : null;
            if (!nameW) return;

            const root = document.createElement("div");
            const preview = document.createElement("div");
            preview.className = "zeon-preview";

            for (const [label, tokens] of TOKEN_GROUPS) {
                const rl = document.createElement("div");
                rl.className = "zeon-rowlabel";
                rl.textContent = label.toUpperCase() + " — click to add";
                root.appendChild(rl);
                const row = document.createElement("div");
                row.className = "zeon-chiprow";
                for (const [chipLabel, token] of tokens) {
                    const c = document.createElement("button");
                    c.type = "button";
                    c.className = "zeon-chip";
                    c.textContent = chipLabel;
                    c.title = "Append " + token + " to the filename pattern";
                    c.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const cur = String(nameW.value || "");
                        const sep = cur && !cur.endsWith("_") && !cur.endsWith("%") ? "_" : "";
                        nameW.value = cur + sep + token;
                        update();
                    });
                    row.appendChild(c);
                }
                root.appendChild(row);
            }
            root.appendChild(preview);

            const w = node.addDOMWidget("zeon_saver_tokens", "saver", root, {
                serialize: false,
                getMinHeight: () => 118,
            });
            w.serialize = false;

            function update() {
                preview.textContent = "→ " + previewName(nameW.value, extW ? extW.value : "png");
            }
            interceptWidgetValue(nameW, update);
            if (extW) interceptWidgetValue(extW, update);
            update();
        } catch (err) {
            console.error("[ZeonmkII Save Image] setup error:", err);
        }
    },
});
