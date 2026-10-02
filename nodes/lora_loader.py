"""
ZeonmkII LoRAs Loader — multi-LoRA loader, one node, Add-LoRA style.

Born from Character Swap v2's proven engine, stripped to what a loader
should be: per slot just the LoRA name, model strength, clip strength, and
an enable toggle. No trigger words, no selection, no random — that whole
brain stays in Character Swap.

v0.11.0: no count widget. The UI starts EMPTY; "➕ Add LoRA" reveals the
next slot as one row (combo + strengths), the eye button toggles it, ✕
removes it and shifts the stack up. Hidden slots serialize as nothing, so
saved workflows restore exactly the rows that were on screen.

Slots chain top-to-bottom for every ENABLED slot with a real LoRA selected,
through ComfyUI's stock load_lora_for_models path — the identical result to
wiring native LoraLoader nodes in sequence.
"""

import comfy.utils
import folder_paths
from comfy.sd import load_lora_for_models


class ZeonmkIILoRAsLoader:
    MAX_LORAS = 8

    @classmethod
    def INPUT_TYPES(cls):
        loras = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {
            "required": {
                "model": ("MODEL", {"tooltip": "The diffusion model. Enabled LoRAs apply on top of it, in slot order."}),
                "clip": ("CLIP", {"tooltip": "The CLIP/text-encoder model. Enabled LoRAs apply on top of it, in slot order."}),
            },
        }
        for i in range(1, cls.MAX_LORAS + 1):
            inputs["required"][f"enabled_{i}"] = ("BOOLEAN", {
                "default": True,
                "tooltip": f"LoRA #{i}: apply it this run. Off = bypassed (no load, no cost). Driven by the eye button.",
            })
            inputs["required"][f"lora_{i}"] = (loras, {
                "tooltip": f"LoRA #{i}: file, or None (slot does nothing).",
            })
            inputs["required"][f"strength_model_{i}"] = ("FLOAT", {
                "default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05,
                "tooltip": f"LoRA #{i}: model strength.",
            })
            inputs["required"][f"strength_clip_{i}"] = ("FLOAT", {
                "default": 0.3, "min": -10.0, "max": 10.0, "step": 0.05,
                "tooltip": f"LoRA #{i}: CLIP strength.",
            })
        return inputs

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "chain_summary")
    FUNCTION = "load_all"
    CATEGORY = "ZeonmkII"

    def load_all(self, model, clip, **kwargs):
        out_model, out_clip = model, clip
        chain = []
        for i in range(1, self.MAX_LORAS + 1):
            if not kwargs.get(f"enabled_{i}", True):
                continue
            lora_name = kwargs.get(f"lora_{i}", "None")
            if not lora_name or lora_name == "None":
                continue
            s_model = float(kwargs.get(f"strength_model_{i}", 1.0))
            s_clip = float(kwargs.get(f"strength_clip_{i}", 0.3))
            if s_model == 0 and s_clip == 0:
                continue
            lora_path = folder_paths.get_full_path("loras", lora_name)
            if not lora_path:
                continue
            lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
            out_model, out_clip = load_lora_for_models(out_model, out_clip, lora, s_model, s_clip)
            short = str(lora_name).rsplit("/", 1)[-1].rsplit(".", 1)[0]
            chain.append(f"{short} ({s_model:g}/{s_clip:g})")
        return (out_model, out_clip, " → ".join(chain) if chain else "no LoRAs active")
