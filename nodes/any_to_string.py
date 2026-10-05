"""ZeonmkII ANY to STRING (v0.21.0)

The metadata pipe's universal adapter: ANY input → readable STRING output,
so any node's output can become text (feeds the Save Image metadata inputs,
filenames, or plain inspection).

NaN-carrier note: this node deliberately overrides NOTHING — no IS_CHANGED,
no OUTPUT_NODE — so it emits plain strings only. It replaces the
third-party "(Image Saver)" helper chain (alexopus/easy-use showAnything
family), which was our prime suspect for the XY-panel NaN websocket deaths:
those override IS_CHANGED with non-string values, Python json.dumps happily
emits bare NaN for them, and the browser's strict JSON.parse chokes.
"""
import json

_MAX_DEPTH = 8


def _native(value, depth):
    """JSON-native view for dict interiors: keeps numbers/bools/strings as-is,
    recurses lists/dicts, falls back to display text for everything else."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)) and depth < _MAX_DEPTH:
        return [_native(v, depth + 1) for v in value]
    if isinstance(value, dict) and depth < _MAX_DEPTH:
        return {str(k): _native(v, depth + 1) for k, v in value.items()}
    return _stringify(value, depth)


def _stringify(value, depth=0):
    if value is None:
        return "None"
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)) and depth < _MAX_DEPTH:
        parts = [_stringify(v, depth + 1) for v in value]
        body = ", ".join(parts)
        return f"[{body}]" if isinstance(value, list) else f"({body})"
    if isinstance(value, dict) and depth < _MAX_DEPTH:
        return json.dumps(_native(value, depth + 1), ensure_ascii=False)
    if hasattr(value, "shape"):
        # tensors (torch / numpy): shape summary, never the raw data
        try:
            shape = "\u00d7".join(str(int(s)) for s in value.shape)
            dtype = getattr(value, "dtype", None)
            return f"[{type(value).__name__} {shape}{' ' + str(dtype) if dtype else ''}]"
        except Exception:
            pass
    if hasattr(value, "size") and hasattr(value, "mode"):
        # PIL image
        try:
            return f"[image {value.size[0]}\u00d7{value.size[1]} {value.mode}]"
        except Exception:
            pass
    # plain objects (e.g. the saver's METADATA): dump public attrs
    try:
        attrs = {k: v for k, v in vars(value).items() if not k.startswith("_")}
        if attrs:
            return json.dumps(
                {k: _native(v, depth + 1) for k, v in attrs.items()},
                ensure_ascii=False,
                default=str,
            )
    except TypeError:
        pass  # vars() not available on this type
    return repr(value)


class ZeonmkIIAnyToString:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "value": ("*", {
                    "tooltip": "Any output — converted to readable text. "
                               "Lists/dicts render structured; tensors and "
                               "images render as shape summaries.",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("value as readable text",)
    FUNCTION = "convert"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Convert any output to a readable string"

    def convert(self, value):
        return (_stringify(value),)
