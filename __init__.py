"""
@author: ZeonmkII
@title: ComfyUI-ZeonmkII-Nodes
@version: 0.9.0
@project: https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes
@description: Utility-layer nodes for ComfyUI — character swapping, prompt
tooling, timers, Krea 2 resolution presets, canvas notes, native-parity
image saving and workflow glue that never touches the inference path.
Model-agnostic by design: works the same on SDXL, Krea 2, Z-Image and
whatever ships next.
"""

import os
import sys

sys.modules["ZeonmkII_Nodes"] = sys.modules[__name__]

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

from .nodes.character_swap import ZeonmkIICharacterSwap
from .nodes.character_swap_v2 import ZeonmkIICharacterSwapV2
from .nodes.image_saver import ZeonmkIISaveImage
from .nodes.note import ZeonmkIINote
from .nodes.random_image import ZeonmkIIRandomImage
from .nodes.resolution import ZeonmkIIResolution
from .nodes.run_timer import ZeonmkIIRunTimer

NODE_CLASS_MAPPINGS = {
    "ZeonmkII Character Swap": ZeonmkIICharacterSwap,
    "ZeonmkII Character Swap v2": ZeonmkIICharacterSwapV2,
    "ZeonmkII Note": ZeonmkIINote,
    "ZeonmkII Random Image": ZeonmkIIRandomImage,
    "ZeonmkII Resolution": ZeonmkIIResolution,
    "ZeonmkII Run Timer": ZeonmkIIRunTimer,
    "ZeonmkII Save Image": ZeonmkIISaveImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZeonmkII Character Swap": "🌀 Character Swap (ZeonmkII)",
    "ZeonmkII Character Swap v2": "🌀 Character Swap (ZeonmkII) v2",
    "ZeonmkII Note": "📝 Note (ZeonmkII)",
    "ZeonmkII Random Image": "🎲 Random Image (ZeonmkII)",
    "ZeonmkII Resolution": "📐 Resolution (ZeonmkII)",
    "ZeonmkII Run Timer": "⏱ Run Timer (ZeonmkII)",
    "ZeonmkII Save Image": "💾 Save Image (ZeonmkII)",
}
