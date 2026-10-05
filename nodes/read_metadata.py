"""ZeonmkII Read Metadata (v0.21.0)

The read side of the metadata pipe: point it at a saved image and get the
generation metadata back out as strings — the round trip for what Image
Saver embeds (a1111-style parameters, the workflow/prompt JSON ComfyUI
bakes in, and any custom text chunks like our source strings).

Outputs:
  text — one "key: value" line per metadata chunk (long values truncated
         at 4000 chars with a pointer to the json output)
  json — the full metadata dict as JSON, nothing truncated

Pillow does the chunk reading (PNG primary; JPEG/WEBP best-effort via the
same API). No caching games: runs when its input changes, reads the file
fresh every execution.
"""
import json
import os

from PIL import Image

_SKIP_KEYS = {"icc_profile", "srgb", "gamma", "chromaticity", "exif"}
_TRUNCATE_AT = 4000


class ZeonmkIIReadMetadata:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "image_path": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Path to a saved image file (PNG best). "
                               "Quotes from drag-drop are stripped.",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "json")
    OUTPUT_TOOLTIPS = ("key: value lines (long values truncated)", "full metadata as JSON")
    FUNCTION = "read"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Read generation metadata back out of a saved image"

    def read(self, image_path):
        path = (image_path or "").strip().strip('"').strip("'").strip()
        if not path:
            raise ValueError("[ZeonmkII Read Metadata] image_path is empty — point it at a saved image")
        if not os.path.isfile(path):
            raise ValueError(f"[ZeonmkII Read Metadata] file not found: {path}")

        with Image.open(path) as im:
            meta = {}
            # .text: PNG tEXt/iTXt/zTXt chunks (Pillow >= 8.2 or so)
            text = getattr(im, "text", None)
            if isinstance(text, dict):
                for k, v in text.items():
                    if isinstance(v, str) and v:
                        meta[k] = v
            # .info: legacy catch-all (JPEG COM segment lands here too)
            for k, v in (getattr(im, "info", {}) or {}).items():
                if isinstance(v, str) and v:
                    meta.setdefault(k, v)

        lines = []
        for k in sorted(meta):
            v = meta[k]
            if not isinstance(v, str) or not v:
                continue
            if k.lower() in _SKIP_KEYS:
                continue
            if len(v) > _TRUNCATE_AT:
                shown = v[:_TRUNCATE_AT] + f" \u2026(+{len(v) - _TRUNCATE_AT} chars, use json output)"
            else:
                shown = v
            lines.append(f"{k}: {shown}")

        pretty = "\n".join(lines) if lines else "(no text metadata found in this file)"
        full = json.dumps(meta, ensure_ascii=False, indent=2)
        return (pretty, full)
