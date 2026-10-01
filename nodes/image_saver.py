"""
ZeonmkII Save Image — save with Pixaroma-style naming and a WORKING
embedded workflow.

Why this exists: the pack it replaces wrote a polluted 'prompt' chunk
(compound subgraph-style keys mixed in) and an extra 'parameters' chunk,
and ComfyUI's drop-loader choked on the mix — dragging the PNG onto the
canvas rebuilt a dumb approximation instead of the real workflow.

The fix is native parity. Stock ComfyUI's SaveImage writes exactly two
tEXt chunks: 'prompt' (the API-format graph, VERBATIM from the hidden
PROMPT input — whatever ComfyUI itself constructed) and 'workflow' (the
UI graph, verbatim from EXTRA_PNGINFO). We write the same two chunks, the
same way (PIL PngInfo.add_text + json.dumps). If a native save loads,
ours loads — same bytes, same rules.

On top of that: filename tokens (%date% %time% %counter% %seed% %steps%
%cfg% %sampler% %scheduler% %model% %width% %height%), subfolder paths
under output/, and an A1111-style 'parameters' metadata string built from
the actual sampler settings — strictly OPTIONAL (off by default), because
extra chunks are exactly what poisoned the old file.
"""

import json
import os
import time

import folder_paths
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

DEFAULT_FILENAME = "Zeon_%date%_%counter%"


def _tensor_to_pil(tensor):
    arr = (tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    if arr.ndim == 3 and arr.shape[2] > 4:
        arr = arr[:, :, :3]
    return Image.fromarray(arr)


def _walk_prompt(prompt):
    """First sampler-ish node + first checkpoint loader in the API graph."""
    sampler, ckpt = None, None
    for node in (prompt or {}).values():
        if not isinstance(node, dict):
            continue
        ct = str(node.get("class_type", ""))
        if sampler is None and ("sampler" in ct.lower()):
            sampler = node.get("inputs", {})
        if ckpt is None and ("checkpoint" in ct.lower() or "ckpt" in ct.lower()):
            ckpt = node.get("inputs", {})
        if sampler and ckpt:
            break
    return sampler or {}, ckpt or {}


def _meta_values(prompt):
    sampler, ckpt = _walk_prompt(prompt)
    seed = sampler.get("seed", sampler.get("noise_seed", ""))
    return {
        "seed": seed,
        "steps": sampler.get("steps", ""),
        "cfg": sampler.get("cfg", ""),
        "sampler": sampler.get("sampler_name", ""),
        "scheduler": sampler.get("scheduler", ""),
        "model": os.path.basename(str(ckpt.get("ckpt_name", "")) or ""),
    }


def expand_tokens(pattern, meta, width, height, out_dir):
    """Expand %tokens%. %counter% is special: native-style '_00001_' suffix,
    bumped past any existing file in the target folder."""
    now = time.localtime()
    reps = {
        "%date%": f"{now.tm_year:04}-{now.tm_mon:02}-{now.tm_mday:02}",
        "%time%": f"{now.tm_hour:02}{now.tm_min:02}{now.tm_sec:02}",
        "%seed%": str(meta["seed"]),
        "%steps%": str(meta["steps"]),
        "%cfg%": str(meta["cfg"]),
        "%sampler%": str(meta["sampler"]),
        "%scheduler%": str(meta["scheduler"]),
        "%model%": str(meta["model"]),
        "%width%": str(width),
        "%height%": str(height),
    }
    base = str(pattern or DEFAULT_FILENAME)
    for k, v in reps.items():
        base = base.replace(k, v)
    base = base.replace("%counter%", "")
    base = base.rstrip("_ ").strip()
    if not base:
        base = "Zeon"

    n = 1
    while os.path.exists(os.path.join(out_dir, f"{base}_{n:05}_.png")):
        n += 1
    return f"{base}_{n:05}_", n


def build_parameters_string(prompt, meta):
    """A1111-style one-string summary for the optional 'parameters' chunk."""
    pos, neg = "", ""
    for node in (prompt or {}).values():
        if isinstance(node, dict) and node.get("class_type") == "CLIPTextEncode":
            text = str(node.get("inputs", {}).get("text", "")).strip()
            if text and not pos:
                pos = text
            elif text:
                neg = text
                break
    parts = [pos]
    if neg:
        parts.append(f"Negative prompt: {neg}")
    facts = [
        f"Steps: {meta['steps']}", f"CFG: {meta['cfg']}",
        f"Sampler: {meta['sampler']}", f"Scheduler: {meta['scheduler']}",
        f"Seed: {meta['seed']}", f"Model: {meta['model']}",
        "Size: {w}x{h}",
    ]
    parts.append(", ".join(p for p in facts if not p.endswith(": ")))
    return "\n".join(parts)


class ZeonmkIISaveImage:
    DESCRIPTION = (
        "Saves PNGs with token-based naming (%date% %time% %counter% %seed% "
        "%steps% %cfg% %sampler% %scheduler% %model% %width% %height%) into "
        "any subfolder of output/. Embeds the workflow the same way stock "
        "ComfyUI does — clean prompt + workflow chunks — so dropping the "
        "image on the canvas loads the REAL workflow."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The image(s) to save. Batch frames save as _00001_, _00002_, ..."}),
                "filename": ("STRING", {
                    "multiline": False,
                    "default": DEFAULT_FILENAME,
                    "tooltip": "Name pattern. Tokens: %date% %time% %counter% %seed% %steps% %cfg% %sampler% %scheduler% %model% %width% %height%.",
                }),
                "path": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "tooltip": "Subfolder under ComfyUI's output dir (e.g. 'krea2/sheets'). Empty = output root. Refuses traversal.",
                }),
            },
            "optional": {
                "embed_workflow": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Embed prompt + workflow chunks exactly like stock ComfyUI, so the PNG drop-loads the real workflow.",
                }),
                "a1111_metadata": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Also write an A1111-style 'parameters' chunk (steps/cfg/sampler/seed/model). Extra chunk — leave off unless a tool asks for it.",
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filenames",)
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "ZeonmkII"

    def save_images(self, images, filename=DEFAULT_FILENAME, path="",
                    embed_workflow=True, a1111_metadata=False,
                    prompt=None, extra_pnginfo=None):
        out_root = folder_paths.get_output_directory()
        sub = str(path or "").strip().replace("\\", "/")
        while sub.startswith("/"):
            sub = sub[1:]
        parts = [p for p in sub.split("/") if p and p not in (".", "..")]
        out_dir = os.path.normpath(os.path.join(out_root, *parts))
        if os.path.normpath(out_root) != os.path.commonpath([out_root, out_dir]):
            raise Exception(f"Path escapes the output folder: {path}")
        os.makedirs(out_dir, exist_ok=True)

        meta = _meta_values(prompt)
        base, start_n = expand_tokens(filename, meta, images.shape[2], images.shape[1], out_dir)

        pnginfo = PngInfo()
        if embed_workflow:
            if prompt is not None:
                pnginfo.add_text("prompt", json.dumps(prompt))
            if isinstance(extra_pnginfo, dict):
                for k, v in extra_pnginfo.items():
                    try:
                        pnginfo.add_text(k, json.dumps(v))
                    except Exception:
                        pass
        if a1111_metadata:
            params = build_parameters_string(prompt, meta).replace(
                "{w}x{h}", f"{images.shape[2]}x{images.shape[1]}")
            pnginfo.add_text("parameters", params)

        saved = []
        n = start_n
        for i, frame in enumerate(images):
            name = base if i == 0 else f"{base.rsplit('_', 1)[0]}_{n + i:05}_"
            fp = os.path.join(out_dir, name + ".png")
            _tensor_to_pil(frame).save(fp, pnginfo=pnginfo)
            saved.append(os.path.relpath(fp, out_root))
        return {"ui": {"images": [{"filename": os.path.basename(s), "subfolder": os.path.dirname(s), "type": "output"} for s in saved]}, "result": (", ".join(saved),)}
