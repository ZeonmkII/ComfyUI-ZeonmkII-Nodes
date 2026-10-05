"""
@author: ZeonmkII
@title: ComfyUI-ZeonmkII-Nodes
@version: 0.26.1
@project: https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes
@description: Utility-layer nodes for ComfyUI — character swapping, prompt
tooling, timers, Krea 2 resolution presets, native-parity
image saving, multi-LoRA loading, XY comparison grids with sweep-respecting
generators, a global seed, seeded wildcard expansion, and workflow glue that never
touch the inference path.
Model-agnostic by design: works the same on SDXL, Krea 2, Z-Image and
whatever ships next.
"""

import os
import sys

sys.modules["ZeonmkII_Nodes"] = sys.modules[__name__]

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

from .nodes.character_swap import ZeonmkIICharacterSwap
from .nodes.image_saver import ZeonmkIISaveImage
from .nodes.lora_loader import ZeonmkIILoRAsLoader
from .nodes.xy_plot import ZeonmkIIXYPlot
from .nodes.random_image import ZeonmkIIRandomImage
from .nodes.random_prompt import ZeonmkIIRandomPrompt
from .nodes.global_seed import ZeonmkIIGlobalSeed
from .nodes.wildcard_expand import ZeonmkIIWildcardExpand
from .nodes.any_to_string import ZeonmkIIAnyToString
from .nodes.read_metadata import ZeonmkIIReadMetadata
from .nodes.manifest import ZeonmkIIManifest, ZeonmkIIManifestExpand
from .nodes.pipe import ZeonmkIIPipeIn, ZeonmkIIPipeOut, ZeonmkIIPipeEdit, ZeonmkIIPipeInit, ZeonmkIIPipeInsert
from .nodes.text_blocks import ZeonmkIIString, ZeonmkIIStringComposer
from .nodes.resolution import ZeonmkIIResolution
from .nodes.run_timer import ZeonmkIIRunTimer

try:
    from .nodes import _browse_routes  # noqa: F401 - registers the Browse route on the server
except Exception as _e:
    print(f"[ZeonmkII] save-image browse route not registered: {_e}")

try:
    from .nodes import _lora_routes  # noqa: F401 - registers the LoRA Loader API routes
except Exception as _e:
    print(f"[ZeonmkII] lora loader routes not registered: {_e}")

try:
    from .nodes import _random_image_routes  # noqa: F401 - registers the Random Image stats route
except Exception as _e:
    print(f"[ZeonmkII] random image stats route not registered: {_e}")

try:
    from .nodes import _random_prompt_routes  # noqa: F401 - registers the Random Prompt stats/reset routes
except Exception as _e:
    print(f"[ZeonmkII] random prompt routes not registered: {_e}")

try:
    from .nodes import _xy_routes  # noqa: F401 - registers the /zeonmkii/api/xy_plot/* save routes
except Exception as _e:
    print(f"[ZeonmkII] xy plot routes not registered: {_e}")

NODE_CLASS_MAPPINGS = {
    "ZeonmkII Character Swap": ZeonmkIICharacterSwap,
    "ZeonmkII LoRAs Loader": ZeonmkIILoRAsLoader,
    "ZeonmkII XY Plot": ZeonmkIIXYPlot,
    "Load Random Image ZeonmkII": ZeonmkIIRandomImage,
    "Load Random Prompt ZeonmkII": ZeonmkIIRandomPrompt,
    "ZeonmkII Global Seed": ZeonmkIIGlobalSeed,
    "ZeonmkII Wildcard Expand": ZeonmkIIWildcardExpand,
    "ZeonmkII ANY to STRING": ZeonmkIIAnyToString,
    "ZeonmkII Read Metadata": ZeonmkIIReadMetadata,
    "ZeonmkII Manifest": ZeonmkIIManifest,
    "ZeonmkII Manifest Expand": ZeonmkIIManifestExpand,
    "ZeonmkII Pipe In": ZeonmkIIPipeIn,
    "ZeonmkII Pipe Out": ZeonmkIIPipeOut,
    "ZeonmkII Pipe Edit": ZeonmkIIPipeEdit,
    "ZeonmkII Pipe Init": ZeonmkIIPipeInit,
    "ZeonmkII Pipe Insert": ZeonmkIIPipeInsert,
    "ZeonmkII String": ZeonmkIIString,
    "ZeonmkII String Composer": ZeonmkIIStringComposer,
    "ZeonmkII Resolution": ZeonmkIIResolution,
    "ZeonmkII Run Timer": ZeonmkIIRunTimer,
    "ZeonmkII Save Image": ZeonmkIISaveImage,
}

# Pixaroma-style display names (Boss 23:06): <name> ZeonmkII, plain text.
# Keys stay stable so saved workflows and comfyClass JS matchers never break.
NODE_DISPLAY_NAME_MAPPINGS = {
    "ZeonmkII Character Swap": "🌀 Character Swap ZeonmkII",
    "ZeonmkII LoRAs Loader": "🔗 LoRAs Loader ZeonmkII",
    "ZeonmkII XY Plot": "📊 XY Plot ZeonmkII",
    "ZeonmkII ANY to STRING": "🔤 ANY to STRING ZeonmkII",
    "ZeonmkII Read Metadata": "🧾 Read Metadata ZeonmkII",
    "ZeonmkII Manifest": "📦 Manifest ZeonmkII",
    "ZeonmkII Manifest Expand": "📤 Manifest Expand ZeonmkII",
    "ZeonmkII Pipe In": "🔌 Pipe In ZeonmkII",
    "ZeonmkII Pipe Out": "📤 Pipe Out ZeonmkII",
    "ZeonmkII Pipe Edit": "✏️ Pipe Edit ZeonmkII",
    "ZeonmkII Pipe Init": "🚰 Pipe Init ZeonmkII",
    "ZeonmkII Pipe Insert": "➕ Pipe Insert ZeonmkII",
    "ZeonmkII String": "✍️ String ZeonmkII",
    "ZeonmkII String Composer": "🧵 String Composer ZeonmkII",
    "Load Random Image ZeonmkII": "🎲 Load Random Image ZeonmkII",
    "Load Random Prompt ZeonmkII": "🎲 Load Random Prompt ZeonmkII",
    "ZeonmkII Global Seed": "🌱 Global Seed ZeonmkII",
    "ZeonmkII Wildcard Expand": "🃏 Wildcard Expand ZeonmkII",
    "ZeonmkII Resolution": "📐 Resolution ZeonmkII",
    "ZeonmkII Run Timer": "⏱ Run Timer ZeonmkII",
    "ZeonmkII Save Image": "💾 Save Image ZeonmkII",
}
