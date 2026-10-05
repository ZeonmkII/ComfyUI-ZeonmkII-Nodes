"""ZeonmkII text blocks (v0.25.0) — String + String Composer (Boss spec Oct 3, shape B).

- ✍️ String: the wide hand-editing textbox core never shipped. One multiline
  widget, STRING out, convert-to-input compatible.
- 🧵 String Composer: the whole prompt stack in ONE node. Eight slots; an
  unwired slot shows its own inline wide textbox (type the header right
  in), the moment a wire lands its box hides itself (JS side). Separator
  widget between parts (default ", "), empty slots skipped silently.
  The JS layer adds the ＋/－ growth control and the live preview band —
  Python just joins what arrives.

Companion JS: js/string_composer.js (visibility + growth + preview band).
"""
_SLOT_COUNT = 8


def join_slots(separator, values):
    """Shared composer logic: skip empty slots, join with the separator.
    Empty/whitespace slots never contribute — and never leave stray
    separators behind."""
    parts = [v.strip() for v in values if isinstance(v, str) and v.strip() != ""]
    sep = separator if separator is not None else ", "
    return sep.join(parts)


class ZeonmkIIString:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "the wide hand-editing box — header/footer text, triggers, styles…",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "get"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "The wide multiline text box ComfyUI never shipped"

    def get(self, text=""):
        return (text or "",)


class ZeonmkIIStringComposer:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        optional = {}
        for i in range(1, _SLOT_COUNT + 1):
            optional[f"slot_{i}"] = ("STRING", {
                "default": "",
                "multiline": True,
                "tooltip": "unwired slots show their box (type here); wired slots take the wire's text; empty slots are skipped",
            })
        return {
            "required": {
                "separator": ("STRING", {
                    "default": ", ",
                    "multiline": False,
                    "tooltip": "joined between the non-empty parts",
                }),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("the final joined prompt — header + parts + footer",)
    FUNCTION = "compose"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "One node = the whole prompt stack: inline text boxes where unwired, live preview band"

    def compose(self, separator, **kwargs):
        values = [kwargs.get(f"slot_{i}") for i in range(1, _SLOT_COUNT + 1)]
        return (join_slots(separator, values),)
