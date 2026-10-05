"""ZeonmkII Manifest (v0.22.0)

The metadata pipe, Boss's spec: one cable instead of ten strings sprawling.

  sources → [📦 Manifest] ──one cable──→ [📤 Manifest Expand] → Save Image

- Manifest (collector): eight ANY mouths — prompts, LoRA params, seeds,
  anything — auto-stringified (same engine as ANY to STRING) and bundled
  into ONE typed MANIFEST cable. Empty mouths are skipped.
- Manifest Expand: sits directly in front of Save Image. Auto-composes the
  bundle into readable text; if you type something in its text box, YOUR
  text wins (the final once-over edit).

Text only, provenance only — never model/clip/latent (that's the Easy-Use
pipe's game, and the caching pain that comes with it). The MANIFEST type
only connects to our own Expand, so the bundle can't leak into the wrong
socket. Rename candidate kept lean: "Manifest" ≠ "pipe" (every pack owns
that word now) and it's literally what it is — a cargo manifest.
"""
import json

from .any_to_string import _stringify

_SLOT_COUNT = 8


def _slot_keys():
    return [str(i) for i in range(1, _SLOT_COUNT + 1)]


def compose(manifest):
    """manifest dict → readable text. Shared by the node and tests."""
    if not isinstance(manifest, dict):
        return ""
    title = (manifest.get("title") or "").strip() or "ZeonmkII Manifest"
    slots = manifest.get("slots") or {}
    lines = [f"== {title} =="]
    for k in sorted(slots, key=lambda x: int(x) if str(x).isdigit() else 99):
        v = slots[k]
        if isinstance(v, str) and "\n" in v:
            lines.append(f"[{k}]\n{v}")
        else:
            lines.append(f"[{k}] {v}")
    return "\n".join(lines)


class ZeonmkIIManifest:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "title": ("STRING", {
                    "default": "ZeonmkII Manifest",
                    "multiline": False,
                    "tooltip": "Header line for the composed text",
                }),
            },
            "optional": {
                f"in_{i}": ("*", {
                    "tooltip": "Any output — auto-stringified into the manifest. Leave unconnected to skip.",
                })
                for i in range(1, _SLOT_COUNT + 1)
            },
        }

    RETURN_TYPES = ("MANIFEST",)
    RETURN_NAMES = ("manifest",)
    OUTPUT_TOOLTIPS = ("The bundle — feed it to Manifest Expand in front of Save Image",)
    FUNCTION = "collect"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Collect any outputs into one text bundle"

    def collect(self, title, **kwargs):
        slots = {}
        for k in _slot_keys():
            v = kwargs.get(f"in_{k}")
            if v is None:
                continue
            s = _stringify(v)
            if not isinstance(s, str) or s.strip() == "":
                continue
            slots[k] = s
        return ({"title": (title or "").strip(), "slots": slots},)


class ZeonmkIIManifestExpand:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "manifest": ("MANIFEST", {
                    "tooltip": "Bundle from the Manifest collector",
                }),
                "text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Leave empty to auto-compose the bundle. Type here for your final edit — it wins.",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("Composed (or hand-edited) text for the Save Image custom/label fields",)
    FUNCTION = "expand"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Un-bundle a manifest into final text before Save Image"

    def expand(self, manifest, text=""):
        t = (text or "").strip()
        if t:
            return (text,)
        return (compose(manifest if isinstance(manifest, dict) else {}),)
