"""
@author: ZeonmkII
@title: ComfyUI-ZeonmkII-Nodes
@version: 0.4.0
@project: https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes
@description: Utility-layer nodes for ComfyUI — character swapping, prompt
tooling and workflow glue that never touch the inference path. Model-agnostic
by design: works the same on SDXL, Krea2, Z-Image and whatever ships next.
"""

import os
import sys

sys.modules["ZeonmkII_Nodes"] = sys.modules[__name__]

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

from .nodes.character_swap import ZeonmkIICharacterSwap
from .nodes.character_swap_v2 import ZeonmkIICharacterSwapV2

NODE_CLASS_MAPPINGS = {
    "ZeonmkII Character Swap": ZeonmkIICharacterSwap,
    "ZeonmkII Character Swap v2": ZeonmkIICharacterSwapV2,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZeonmkII Character Swap": "🌀 Character Swap (ZeonmkII)",
    "ZeonmkII Character Swap v2": "🌀 Character Swap (ZeonmkII) v2",
}
