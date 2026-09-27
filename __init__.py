"""
@author: ZeonmkII
@title: ComfyUI-ZeonmkII-Nodes
@version: 0.3.0
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

NODE_CLASS_MAPPINGS = {
    "ZeonmkII Character Swap": ZeonmkIICharacterSwap,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZeonmkII Character Swap": "🌀 Character Swap (ZeonmkII)",
}
