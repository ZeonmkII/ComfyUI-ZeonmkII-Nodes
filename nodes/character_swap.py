"""
ZeonmkII Character Swap
=======================
One node that replaces the classic multi-node "character swap" group:
a table of characters (LoRA + trigger word each), a selection mechanism
(manual or seeded random), and a token swap that writes the chosen
character's trigger word into the prompt.

Utility-layer only: uses ComfyUI's stock LoRA loader path and a plain
string replace. Zero inference-path contact, so it works identically on
SDXL, Krea2, Z-Image and any future model family.

v0.3.0: dynamic slots are back — the JS UI hides slots above char_count,
mirroring ComfyUI-LoRA-Optimizer's proven pattern. The v0.1.x save/reload
bug (one top value eaten per reopen) is fixed at the root: the seed input
is named random_seed, because ComfyUI's frontend auto-attaches a
control_after_generate widget to anything named exactly 'seed', which
breaks positional value restore.
"""

import random

import comfy.utils
import folder_paths
from comfy.sd import load_lora_for_models


class ZeonmkIICharacterSwap:
    MAX_CHARS = 8

    @classmethod
    def INPUT_TYPES(cls):
        loras = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {
            "required": {
                "model": ("MODEL", {"tooltip": "The diffusion model. The selected character's LoRA is applied on top of it."}),
                "clip": ("CLIP", {"tooltip": "The CLIP/text-encoder model. The selected character's LoRA is applied on top of it."}),
                "text": ("STRING", {"forceInput": True, "tooltip": "Prompt text containing the token to replace."}),
                "token": ("STRING", {"default": "<char>", "tooltip": "Temporary word in the prompt that gets replaced by the chosen character's trigger word."}),
                "char_count": ("INT", {"default": 4, "min": 1, "max": cls.MAX_CHARS, "step": 1,
                                       "tooltip": "How many character slots are ACTIVE. Slots above this number are ignored (no LoRA, excluded from random)."}),
                "select_mode": (["manual", "random"], {
                    "default": "manual",
                    "tooltip": "manual: use the selection input. random: pick a random enabled character (seeded, so sheets stay reproducible).",
                }),
                "selection": ("INT", {"default": 1, "min": 1, "max": cls.MAX_CHARS, "step": 1,
                                      "tooltip": "Which character to use in manual mode (1-based). Connectable, so any INT node can drive it."}),
                "random_min": ("INT", {"default": 1, "min": 1, "max": cls.MAX_CHARS, "step": 1,
                                       "tooltip": "Random mode: lowest selectable character number."}),
                "random_max": ("INT", {"default": 4, "min": 1, "max": cls.MAX_CHARS, "step": 1,
                                       "tooltip": "Random mode: highest selectable character number."}),
                "random_seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF,
                                 "tooltip": "Random mode seed. Connect your global seed so sheets reproduce. (Named random_seed, NOT seed — the frontend auto-attaches machinery to widgets named 'seed' that breaks save/restore on dynamic nodes.)"}),
            },
        }
        for i in range(1, cls.MAX_CHARS + 1):
            inputs["required"][f"enabled_{i}"] = ("BOOLEAN", {
                "default": i <= 4,
                "tooltip": f"Character #{i}: include in random selection. Manually selecting a disabled character passes everything through untouched.",
            })
            inputs["required"][f"lora_{i}"] = (loras, {
                "tooltip": f"Character #{i}: LoRA file, or None for a text-only character (swap happens, no LoRA applied).",
            })
            inputs["required"][f"trigger_{i}"] = ("STRING", {
                "default": "",
                "tooltip": f"Character #{i}: trigger word written into the prompt in place of the token.",
            })
            inputs["required"][f"strength_model_{i}"] = ("FLOAT", {
                "default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05,
                "tooltip": f"Character #{i}: LoRA model strength.",
            })
            inputs["required"][f"strength_clip_{i}"] = ("FLOAT", {
                "default": 0.3, "min": -10.0, "max": 10.0, "step": 0.05,
                "tooltip": f"Character #{i}: LoRA CLIP strength.",
            })
        return inputs

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "INT", "STRING")
    RETURN_NAMES = ("model", "clip", "text", "chosen_index", "chosen_name")
    FUNCTION = "select_and_swap"
    CATEGORY = "ZeonmkII"

    def _pick_index(self, char_count, select_mode, selection, random_min, random_max, random_seed, enabled):
        """Choose which slot drives this run. Returns None for a clean pass-through."""
        n = max(1, min(int(char_count), self.MAX_CHARS))
        if select_mode == "random":
            lo = max(1, min(int(random_min), n))
            hi = max(1, min(int(random_max), n))
            if lo > hi:
                lo, hi = hi, lo
            pool = [i for i in range(lo, hi + 1) if enabled.get(i, True)]
            if not pool:
                return None
            return random.Random(random_seed).choice(pool)

        idx = max(1, min(int(selection), n))
        if not enabled.get(idx, True):
            return None  # manual pick of a benched character = clean pass-through
        return idx

    def select_and_swap(self, model, clip, text, token, char_count, select_mode,
                        selection, random_min, random_max, random_seed, **kwargs):
        enabled = {i: kwargs.get(f"enabled_{i}", True) for i in range(1, self.MAX_CHARS + 1)}
        idx = self._pick_index(char_count, select_mode, selection,
                               random_min, random_max, random_seed, enabled)

        if idx is None:
            # Nothing selected (benched pick / empty random pool): pass through.
            return (model, clip, text, 0, "")

        lora_name = kwargs.get(f"lora_{idx}", "None")
        trigger = kwargs.get(f"trigger_{idx}", "") or ""
        s_model = kwargs.get(f"strength_model_{idx}", 1.0)
        s_clip = kwargs.get(f"strength_clip_{idx}", 0.3)

        # LoRA application — stock core path, identical to built-in LoraLoader.
        out_model, out_clip = model, clip
        if lora_name and lora_name != "None" and (s_model != 0 or s_clip != 0):
            lora_path = folder_paths.get_full_path("loras", lora_name)
            if lora_path:
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                out_model, out_clip = load_lora_for_models(model, clip, lora, s_model, s_clip)

        # Token swap — replace every occurrence; no-op when the token is absent.
        text_out = text.replace(token, trigger) if (token and trigger) else text
        return (out_model, out_clip, text_out, idx, trigger)
