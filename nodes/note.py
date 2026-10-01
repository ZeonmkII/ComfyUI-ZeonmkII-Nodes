"""
ZeonmkII Note — a markdown note that renders on the canvas.

Pure UI node (never runs in Python): the text lives in the node's multiline
STRING widget and saves with the workflow; the JS side renders it live with
the pack's skin. ✏ Edit shows the raw markdown with the render still live
below it; 👁 Done collapses back to the clean rendered view.

Supported markdown subset: #/##/### headers, **bold**, *italic*, `code`,
- bullets, 1. numbered lists, | pipe tables |, --- separators, and
[links](https://...) (http/https only). Everything is escaped before
rendering — the note accepts markdown, never raw HTML.
"""

DEFAULT_NOTE = """## Note

Write **markdown** here — it renders live.

| Node | What it does |
| --- | --- |
| ⏱ Run Timer | times every run |
| 📐 Resolution | Krea 2 presets |

- bullets and `code` work
- [links](https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes) open safely

---
Hit ✏ Edit on the toolbar to write."""


class ZeonmkIINote:
    DESCRIPTION = (
        "A markdown note that renders on the canvas: headers, bold/italic, "
        "code, lists, tables and links. The text saves with the workflow, so "
        "notes travel inside it. Pure annotation — nothing to wire, and the "
        "node never runs."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": DEFAULT_NOTE,
                    "tooltip": "Raw markdown for the note. Use the ✏ Edit button on the node — the render updates as you type.",
                }),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "ZeonmkII"

    def noop(self, text):
        return {}
