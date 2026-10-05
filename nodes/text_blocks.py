"""ZeonmkII text blocks (v0.31.0) — String + String Composer (Boss spec 2026-10-06 02:22).

- ✍️ String: the wide hand-editing textbox core never shipped. One multiline
  widget, STRING out, convert-to-input compatible.
- 🧵 String Composer: DOWNSIZED to four static multiline textboxes — no
  dynamics, no DOM rows, no hidden widgets, no JS layer (the v0.26–v0.30
  dynamic era died on the Nodes-2.0 frontend; Boss pulled the plug 02:22).
  Separator widget between parts (default ", "), escapes keep \\n/\\t/\\\\,
  empty slots skipped silently. Wiring = standard convert-to-input on the
  visible widget.

Companion JS: js/string_composer.js (greeting-only stub).
"""
import re

_SLOT_COUNT = 4  # v0.31.0: Boss's 02:22 downscope — static four, no dynamics

# v0.25.1: the separator box is single-line, so a REAL newline can't be typed
# into it — escapes carry it instead. Alternation order matters: \\ before \n,
# so a literal "\\\\n" survives as backslash + n.
_SEP_ESCAPES = {"\\\\": "\\", "\\n": "\n", "\\t": "\t"}


def decode_separator(separator):
    """Turn the separator box's escape sequences into real characters."""
    s = separator if isinstance(separator, str) else ", "
    return re.sub(r"\\\\|\\n|\\t", lambda m: _SEP_ESCAPES[m.group(0)], s)


def join_slots(separator, values):
    """Shared composer logic: skip empty slots, join with the separator.
    Empty/whitespace slots never contribute — and never leave stray
    separators behind."""
    parts = [v.strip() for v in values if isinstance(v, str) and v.strip() != ""]
    sep = decode_separator(separator)
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
                    "tooltip": "joined between the non-empty parts — escapes: \\n = newline, \\t = tab, \\\\ = literal backslash",
                }),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("the final joined prompt — header + parts + footer",)
    FUNCTION = "compose"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Four textboxes → one string, joined by the separator"

    def compose(self, separator, **kwargs):
        values = [kwargs.get(f"slot_{i}") for i in range(1, _SLOT_COUNT + 1)]
        return (join_slots(separator, values),)
