"""ZeonmkII Input Watcher (v0.28.0) — point at a neighbor, read one field.

alexopus's 'Workflow Input Value' proved the concept (hand-type a node id +
field name); this is the elegant version Boss specced (Oct 5): wire ANY in,
the watcher follows that wire to its ORIGIN node, the user picks a field
from a dropdown of the origin's actual fields (no typing, no misspelling,
no exporting the workflow to hunt for ids), and the field's current value
comes out as STRING at queue time.

Provenance is a frontend fact — Python only ever sees values, never where
they came from. So the split is:

  JS (js/input_value.js): tracks the wire's origin node, builds the field
  dropdown, and STAMPS two hidden inputs at queue time via the same
  graphToPrompt hook pattern the LoRAs Loader uses for LoraLoaderState:
    origin_id   — the origin node's graph id (provenance / debugging)
    value_cache — the picked field's current value, stringified

  Python (this file): pure passthrough. No IS_CHANGED, no OUTPUT_NODE,
  no str() of objects (v0.26.2 law) — any_in flows out untouched;
  value_cache is already a string when it arrives.

Because value_cache is part of the node's inputs, a changed origin value
naturally re-runs this node — same cache-signature argument as the loader.
"""
class ZeonmkIIInputValue:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "input_name": ("STRING", {
                    "default": "",
                    "tooltip": "pick from the origin node's fields — the dropdown "
                               "appears once a wire lands in any_in",
                }),
            },
            "optional": {
                "any_in": ("*", {
                    "tooltip": "wire ANY output here — the value itself is never "
                               "read or converted, it only tells the watcher "
                               "which node (and therefore which fields) to watch",
                }),
            },
            "hidden": {
                "origin_id": ("STRING", {"default": ""}),
                "value_cache": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "*")
    RETURN_NAMES = ("text", "passthrough")
    OUTPUT_TOOLTIPS = (
        "the watched field's current value at queue time",
        "any_in, untouched — lets the watcher sit inline in a chain",
    )
    FUNCTION = "watch"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = (
        "Wire any node's output in; pick one of that node's fields by name; "
        "its current value comes out as STRING. You point at the source, not "
        "a copy — the origin's widget stays the single source of truth."
    )

    def watch(self, input_name: str, any_in=None, origin_id: str = "", value_cache: str = "") -> tuple:
        return (value_cache, any_in)
