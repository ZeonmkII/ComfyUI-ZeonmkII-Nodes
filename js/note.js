/**
 * ComfyUI-ZeonmkII-Nodes — Note UI
 *
 * A cut-down Note node: markdown in, rendered view out. The raw text lives
 * in the node's multiline STRING widget (saved with the workflow); this UI
 * renders it live with the pack's skin. ✏ Edit shows the textarea with the
 * render still live below it (WYSIWYG-lite); 👁 Done collapses back to the
 * clean rendered view.
 *
 * Deliberately markdown, NOT HTML like Pixaroma's note: no sanitizer to
 * respect — everything is escaped before the tiny formatter runs, and
 * links are restricted to http(s). Supported: #/##/### headers, **bold**,
 * *italic*, `code`, - bullets, 1. numbered lists, | tables |, ---
 * separators, [links](https://...).
 */
import { app } from "/scripts/app.js";
import { ensureStyles, applyNodeSkin, makeToolbar } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Note";
const WIDGET_NAME = "text";

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function inline(text) {
    let t = escapeHtml(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/\*([^*]+)\*/g, "<i>$1</i>");
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return t;
}

function renderMarkdown(src) {
    const lines = String(src || "").split(/\r?\n/);
    const out = [];
    let i = 0;
    let listMode = null;

    const closeList = () => {
        if (listMode) { out.push("</" + listMode + ">"); listMode = null; }
    };

    while (i < lines.length) {
        const trimmed = lines[i].trim();

        // table block: header row + |---|---| separator + body rows
        if (trimmed.startsWith("|") &&
            i + 1 < lines.length &&
            /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
            closeList();
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith("|")) {
                const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "")
                    .split("|").map((c) => inline(c.trim()));
                rows.push(cells);
                i++;
            }
            if (rows.length >= 2) {
                let html = '<table class="zeon-note-table"><thead><tr>';
                for (const c of rows[0]) html += "<th>" + c + "</th>";
                html += "</tr></thead><tbody>";
                for (let r = 2; r < rows.length; r++) {
                    html += "<tr>";
                    for (const c of rows[r]) html += "<td>" + c + "</td>";
                    html += "</tr>";
                }
                html += "</tbody></table>";
                out.push(html);
            }
            continue;
        }

        // separator
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            closeList();
            out.push('<hr class="zeon-note-hr">');
            i++;
            continue;
        }

        // headers
        let m = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (m) {
            closeList();
            out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">");
            i++;
            continue;
        }

        // bullet list
        m = trimmed.match(/^[-*]\s+(.*)$/);
        if (m) {
            if (listMode !== "ul") { closeList(); out.push("<ul>"); listMode = "ul"; }
            out.push("<li>" + inline(m[1]) + "</li>");
            i++;
            continue;
        }

        // numbered list
        m = trimmed.match(/^\d+[.)]\s+(.*)$/);
        if (m) {
            if (listMode !== "ol") { closeList(); out.push("<ol>"); listMode = "ol"; }
            out.push("<li>" + inline(m[1]) + "</li>");
            i++;
            continue;
        }

        // blank line
        if (!trimmed) { closeList(); i++; continue; }

        closeList();
        out.push("<p>" + inline(trimmed) + "</p>");
        i++;
    }
    closeList();
    return out.join("\n");
}

// proven visibility toggle (Character Swap v1/v2): hide via hidden flag +
// type-rename + computeSize collapse, never by touching widget values.
// The ORIGINAL type/computeSize are stashed on first hide and restored on
// show — without that, re-showing renames the widget type and the textarea
// stops rendering.
function toggleWidget(widget, show) {
    if (!widget) return;
    if (!widget._zeonOrigType) {
        widget._zeonOrigType = widget.type;
        widget._zeonOrigComputeSize = widget.computeSize;
    }
    widget.hidden = !show;
    widget.type = show ? widget._zeonOrigType : "zeon_hidden";
    widget.computeSize = show ? widget._zeonOrigComputeSize : () => [0, -4];
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
    name: "ComfyUI-ZeonmkII-Nodes.Note",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        ensureStyles();
        applyNodeSkin(node);

        const textW = node.widgets ? node.widgets.find((w) => w.name === WIDGET_NAME) : null;
        if (!textW) return;

        const view = document.createElement("div");
        view.className = "zeon-note";
        const w = node.addDOMWidget("zeon_note_view", "note", view, {});
        w.serialize = false;

        function update() {
            const src = String(textW.value || "");
            view.innerHTML = src.trim()
                ? renderMarkdown(src)
                : '<div class="zeon-note-empty">Empty note — hit ✏ Edit</div>';
        }

        let editing = false;
        makeToolbar(node, [
            {
                label: "✏ Edit",
                title: "Show the raw markdown. The render stays live below while you type.",
                onClick(btn) {
                    editing = !editing;
                    toggleWidget(textW, editing);
                    btn.textContent = editing ? "👁 Done" : "✏ Edit";
                    node.setSize([node.size[0], node.computeSize()[1]]);
                    app.canvas && app.canvas.setDirty && app.canvas.setDirty(true, true);
                },
            },
        ]);

        interceptWidgetValue(textW, () => update());

        // start in clean view mode; hide the raw textarea only after the
        // save/restore window has fully settled (values restore positionally)
        setTimeout(() => {
            toggleWidget(textW, false);
            node.setSize([node.size[0], node.computeSize()[1]]);
            update();
        }, 100);
    },
});
