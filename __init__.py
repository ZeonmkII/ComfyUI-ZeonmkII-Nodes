"""
@author: ZeonmkII
@title: ComfyUI-ZeonmkII-Nodes
@version: 0.14.0
@project: https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes
@description: Utility-layer nodes for ComfyUI — character swapping, prompt
tooling, timers, Krea 2 resolution presets, native-parity
image saving, multi-LoRA loading and workflow glue that never touches the
inference path.
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
from .nodes.random_image import ZeonmkIIRandomImage
from .nodes.resolution import ZeonmkIIResolution
from .nodes.run_timer import ZeonmkIIRunTimer

try:
    from .nodes import _browse_routes  # noqa: F401 - registers the Browse route on the server
except Exception as _e:
    print(f"[ZeonmkII] save-image browse route not registered: {_e}")

NODE_CLASS_MAPPINGS = {
    "ZeonmkII Character Swap": ZeonmkIICharacterSwap,
    "ZeonmkII LoRAs Loader": ZeonmkIILoRAsLoader,
    "ZeonmkII Random Image": ZeonmkIIRandomImage,
    "ZeonmkII Resolution": ZeonmkIIResolution,
    "ZeonmkII Run Timer": ZeonmkIIRunTimer,
    "ZeonmkII Save Image": ZeonmkIISaveImage,
}

# Pixaroma-style display names (Boss 23:06): <name> ZeonmkII, plain text.
# Keys stay stable so saved workflows and comfyClass JS matchers never break.
NODE_DISPLAY_NAME_MAPPINGS = {
    "ZeonmkII Character Swap": "Character Swap ZeonmkII",
    "ZeonmkII LoRAs Loader": "LoRAs Loader ZeonmkII",
    "ZeonmkII Random Image": "Random Image ZeonmkII",
    "ZeonmkII Resolution": "Resolution ZeonmkII",
    "ZeonmkII Run Timer": "Run Timer ZeonmkII",
    "ZeonmkII Save Image": "Save Image ZeonmkII",
}
