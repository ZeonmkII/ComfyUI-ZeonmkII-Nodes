"""
ZeonmkII Save Image — the Image Saver option set, native-parity chunks,
Pixaroma-style UI.

v0.11.0: field-for-field clone of ComfyUI-Image-Saver's input list (Boss's
explicit spec): the data fields are WIRE-IN SLOTS (forceInput) — steps,
cfg, modelname, sampler_name, scheduler_name, positive, negative,
seed_value, denoise, clip_skip, counter, additional_hashes, custom, label —
plus the option widgets (format, quality, lossless webp, png optimize,
embed workflow, sidecar json, a1111 chunk, show preview, time format).
Filename tokens match Image Saver verbatim:
  %date %time %time_format<fmt> %model %basemodelname %width %height %seed
  %counter %counter<pad> %sampler_name %steps %cfg %scheduler_name %denoise
  %clip_skip %custom %label

Chunk discipline (Bit #5 law, unchanged): PNG gets EXACTLY the native pair —
'prompt' (API graph, verbatim) + 'workflow' (UI graph, verbatim) — written
the same way stock ComfyUI writes them. The A1111 'parameters' chunk is a
strictly optional toggle (OFF by default) because extra chunks were the
poison that broke the drop-loader once. Don't flip that lesson.
"""

import hashlib
import json
import os
import re
from datetime import datetime
from typing import Any

import folder_paths
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

DEFAULT_FILENAME = "%time_%basemodelname_%seed"
EXTENSIONS = ["png", "jpeg", "jpg", "webp"]
TIME_FORMAT_DEFAULT = "%Y-%m-%d-%H%M%S"


def _tensor_to_pil(tensor):
    arr = (tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    if arr.ndim == 3 and arr.shape[2] > 4:
        arr = arr[:, :, :3]
    return Image.fromarray(arr)


def _sha256_10(path):
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()[:10].upper()
    except Exception:
        return ""


def _model_hash(modelname):
    name = str(modelname or "").strip().split(",")[0]
    if not name:
        return ""
    try:
        p = folder_paths.get_full_path("checkpoints", name)
        return _sha256_10(p) if p else ""
    except Exception:
        return ""


def _walk_prompt(prompt):
    """First sampler-ish node + first checkpoint loader in the API graph —
    used only to fill slots the user left unwired."""
    sampler, ckpt = {}, {}
    for node in (prompt or {}).values():
        if not isinstance(node, dict):
            continue
        ct = str(node.get("class_type", ""))
        if not sampler and "sampler" in ct.lower():
            sampler = node.get("inputs", {})
        if not ckpt and ("checkpoint" in ct.lower() or "ckpt" in ct.lower()):
            ckpt = node.get("inputs", {})
        if sampler and ckpt:
            break
    return sampler, ckpt


def _clean_modelname(name):
    """'models/checkpoints/foo.safetensors' -> 'foo' (Image Saver rule)."""
    base = os.path.basename(str(name or ""))
    stem, ext = os.path.splitext(base)
    if ext.lower() in (".safetensors", ".ckpt", ".pt", ".bin", ".gguf"):
        return stem
    return base


def _timestamp(fmt):
    try:
        return datetime.now().strftime(fmt)
    except Exception:
        return datetime.now().strftime(TIME_FORMAT_DEFAULT)


def expand_pattern(pattern, vals, time_format):
    """Image Saver token expansion, incl. %time_format<fmt> and %counter<pad>."""
    s = str(pattern or DEFAULT_FILENAME)
    s = re.sub(r"%time_format<([^>]*)>", lambda m: _timestamp(m.group(1)), s)
    s = re.sub(
        r"%counter<(\d+)>",
        lambda m: ("{:0" + m.group(1) + "d}").format(int(vals["counter"])),
        s,
    )
    reps = {
        "%date": _timestamp("%Y-%m-%d"),
        "%time": _timestamp(time_format),
        "%model": _clean_modelname(vals["modelname"]),
        "%basemodelname": _clean_modelname(vals["modelname"]),
        "%width": str(vals["width"]),
        "%height": str(vals["height"]),
        "%seed": str(vals["seed_value"]),
        "%counter": str(vals["counter"]),
        "%sampler_name": str(vals["sampler_name"]),
        "%steps": str(vals["steps"]),
        "%cfg": str(vals["cfg"]),
        "%scheduler_name": str(vals["scheduler_name"]),
        "%denoise": str(vals["denoise"]),
        "%clip_skip": str(vals["clip_skip"]),
        "%custom": str(vals["custom"]),
        "%label": str(vals["label"]),
    }
    for k, v in reps.items():
        s = s.replace(k, v)
    return s


def _resolve_path(path):
    out_root = folder_paths.get_output_directory()
    sub = str(path or "").strip().replace("\\", "/")
    while sub.startswith("/"):
        sub = sub[1:]
    parts = [p for p in sub.split("/") if p and p not in (".", "..")]
    out_dir = os.path.normpath(os.path.join(out_root, *parts))
    if os.path.normpath(out_root) != os.path.commonpath([out_root, out_dir]):
        raise Exception(f"Path escapes the output folder: {path}")
    return out_root, out_dir


def _next_suffix(out_dir, prefix, ext):
    """Batch suffix start: past any existing _NN files (Image Saver rule)."""
    n = None
    try:
        for f in os.listdir(out_dir):
            if f.startswith(prefix) and f.endswith("." + ext):
                stem = os.path.splitext(f)[0]
                tail = stem.rsplit("_", 1)[-1]
                if tail.isdigit():
                    n = max(n or 0, int(tail))
    except OSError:
        pass
    return (n + 1) if n is not None else None


class ZeonmkIISaveImage:
    DESCRIPTION = (
        "Save images with the full Image Saver option set: token naming, any "
        "subfolder, png/jpeg/webp, quality + lossless, workflow embedding and "
        "sidecar JSON, and wire-in slots for every generation fact (steps, "
        "cfg, sampler, seed, model, prompts, ...). PNG chunks are written "
        "exactly like stock ComfyUI, so the file drop-loads the real workflow."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The image(s) to save."}),
                "filename": ("STRING", {
                    "default": DEFAULT_FILENAME,
                    "tooltip": "Tokens: %date %time %time_format<fmt> %model %basemodelname "
                               "%width %height %seed %counter %counter<pad> %sampler_name "
                               "%steps %cfg %scheduler_name %denoise %clip_skip %custom %label",
                }),
                "path": ("STRING", {
                    "default": "",
                    "tooltip": "Output folder path (subfolder under ComfyUI's output dir, e.g. 'krea2/sheets'). Empty = output root.",
                }),
                "extension": (EXTENSIONS, {"default": "png", "tooltip": "File format to save as."}),
            },
            "optional": {
                "steps": ("INT", {"forceInput": True, "tooltip": "number of steps"}),
                "cfg": ("FLOAT", {"forceInput": True, "tooltip": "CFG value"}),
                "modelname": ("STRING", {"forceInput": True, "tooltip": "model name (as string)"}),
                "sampler_name": ("STRING", {"forceInput": True, "tooltip": "sampler name"}),
                "scheduler_name": ("STRING", {"forceInput": True, "tooltip": "scheduler name"}),
                "positive": ("STRING", {"forceInput": True, "tooltip": "positive prompt"}),
                "negative": ("STRING", {"forceInput": True, "tooltip": "negative prompt"}),
                "seed_value": ("INT", {"forceInput": True, "tooltip": "seed"}),
                "width": ("INT", {"forceInput": True, "tooltip": "image width"}),
                "height": ("INT", {"forceInput": True, "tooltip": "image height"}),
                "denoise": ("FLOAT", {"forceInput": True, "tooltip": "denoise value"}),
                "clip_skip": ("INT", {"forceInput": True, "tooltip": "CLIP skip"}),
                "counter": ("INT", {"forceInput": True, "tooltip": "counter (%counter in the name; auto batch suffix otherwise)"}),
                "additional_hashes": ("STRING", {"forceInput": True, "tooltip": "hashes, comma separated, optionally 'Name:HASH'"}),
                "custom": ("STRING", {"forceInput": True, "tooltip": "custom string for the metadata/filename (%custom)"}),
                "label": ("STRING", {"forceInput": True, "tooltip": "plain string usable via %label"}),
                "lossless_webp": ("BOOLEAN", {"default": True, "tooltip": "WebP: lossless encoding."}),
                "quality_jpeg_or_webp": ("INT", {"default": 95, "min": 1, "max": 100, "tooltip": "JPEG / WebP quality."}),
                "optimize_png": ("BOOLEAN", {"default": False, "tooltip": "PNG: optimize (smaller, slower)."}),
                "time_format": ("STRING", {"default": TIME_FORMAT_DEFAULT, "tooltip": "strftime format for %time."}),
                "embed_workflow": ("BOOLEAN", {"default": True, "tooltip": "PNG: embed prompt + workflow chunks exactly like stock ComfyUI (drop-loadable)."}),
                "a1111_metadata": ("BOOLEAN", {"default": False, "tooltip": "PNG: also write an A1111-style 'parameters' chunk from the wired facts. Extra chunk — leave OFF unless a tool needs it (extra chunks once broke drop-loading)."}),
                "save_workflow_as_json": ("BOOLEAN", {"default": False, "tooltip": "Also write the workflow as a sidecar .json."}),
                "show_preview": ("BOOLEAN", {"default": True, "tooltip": "Show the saved image(s) in ComfyUI's preview."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("hashes", "a1111_params")
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "ZeonmkII"

    def save_images(self, images, filename=DEFAULT_FILENAME, path="", extension="png",
                    steps=20, cfg=7.0, modelname="", sampler_name="", scheduler_name="normal",
                    positive="", negative="", seed_value=0, width=0, height=0,
                    denoise=1.0, clip_skip=0, counter=0, additional_hashes="",
                    custom="", label="", lossless_webp=True, quality_jpeg_or_webp=95,
                    optimize_png=False, time_format=TIME_FORMAT_DEFAULT,
                    embed_workflow=True, a1111_metadata=False,
                    save_workflow_as_json=False, show_preview=True,
                    prompt=None, extra_pnginfo=None):
        ext = str(extension or "png").lower()
        if ext == "jpg":
            ext = "jpeg"
        if ext not in EXTENSIONS:
            ext = "png"

        out_root, out_dir = _resolve_path(path)
        os.makedirs(out_dir, exist_ok=True)

        # fill any unwired fact from the API graph before anything reads it
        ps, pc = _walk_prompt(prompt)
        w, h = images.shape[2], images.shape[1]
        vals = {
            "steps": steps, "cfg": cfg,
            "modelname": modelname or str(pc.get("ckpt_name", "")),
            "sampler_name": sampler_name or str(ps.get("sampler_name", "")),
            "scheduler_name": scheduler_name if scheduler_name != "normal" or not ps else str(ps.get("scheduler", "normal")),
            "positive": positive, "negative": negative,
            "seed_value": seed_value if seed_value else ps.get("seed", ps.get("noise_seed", 0)),
            "width": width or w, "height": height or h,
            "denoise": denoise, "clip_skip": clip_skip,
            "counter": counter, "custom": custom, "label": label,
        }

        base = expand_pattern(filename, vals, time_format)
        directory, basename = os.path.split(base)
        target_dir = os.path.normpath(os.path.join(out_dir, directory)) if directory else out_dir
        if os.path.normpath(out_root) != os.path.commonpath([out_root, target_dir]):
            raise Exception(f"Path escapes the output folder: {path}")
        os.makedirs(target_dir, exist_ok=True)

        suffix_start = _next_suffix(target_dir, basename, ext)

        # native-parity chunks — PNG only (JPEG/WebP cannot carry tEXt)
        pnginfo = PngInfo()
        if ext == "png" and embed_workflow:
            if prompt is not None:
                pnginfo.add_text("prompt", json.dumps(prompt))
            if isinstance(extra_pnginfo, dict):
                for k, v in extra_pnginfo.items():
                    try:
                        pnginfo.add_text(k, json.dumps(v))
                    except Exception:
                        pass
        a1111 = self._a1111_params(vals, ext)
        if ext == "png" and a1111_metadata and a1111:
            pnginfo.add_text("parameters", a1111)

        model_hash = _model_hash(vals["modelname"]) if vals["modelname"] else ""
        hashes = ",".join(x for x in [f"{_clean_modelname(vals['modelname'])}:{model_hash}" if model_hash else "", additional_hashes] if x)

        saved = []
        for i, frame in enumerate(images):
            name = basename if suffix_start is None else f"{basename}_{suffix_start + i:02d}"
            fp = os.path.join(target_dir, name + "." + ext)
            img = _tensor_to_pil(frame)
            if ext == "png":
                img.save(fp, pnginfo=pnginfo, optimize=bool(optimize_png))
            elif ext == "jpeg":
                if img.mode not in ("RGB", "L"):
                    bg = Image.new("RGB", img.size, (0, 0, 0))
                    if img.mode == "RGBA":
                        bg.paste(img, mask=img.split()[-1])
                    else:
                        bg.paste(img.convert("RGB"))
                    img = bg
                img.save(fp, quality=int(quality_jpeg_or_webp), optimize=True)
            else:  # webp
                img.save(fp, quality=int(quality_jpeg_or_webp), lossless=bool(lossless_webp))
            if save_workflow_as_json and (prompt is not None or extra_pnginfo):
                with open(os.path.join(target_dir, name + ".json"), "w", encoding="utf-8") as f:
                    json.dump({"prompt": prompt,
                               "workflow": (extra_pnginfo or {}).get("workflow")}, f, indent=1)
            saved.append(os.path.relpath(fp, out_root))

        result = {"result": (hashes, a1111)}
        if show_preview:
            result["ui"] = {"images": [{"filename": os.path.basename(s), "subfolder": os.path.dirname(s), "type": "output"} for s in saved]}
        return result

    @staticmethod
    def _a1111_params(v, ext):
        """A1111-style one-string summary from the wired facts."""
        pos = str(v.get("positive") or "").strip()
        neg = str(v.get("negative") or "").strip()
        if not (pos or neg or v.get("steps")):
            return ""
        parts = [pos if pos else "unknown"]
        if neg:
            parts.append(f"Negative prompt: {neg}")
        facts = [f"Steps: {v['steps']}", f"Sampler: {v['sampler_name']}",
                 f"CFG scale: {v['cfg']}", f"Seed: {v['seed_value']}",
                 f"Size: {v['width']}x{v['height']}"]
        if v.get("clip_skip"):
            facts.append(f"Clip skip: {abs(int(v['clip_skip']))}")
        if v.get("custom"):
            facts.append(str(v["custom"]))
        facts.append(f"Model: {_clean_modelname(v['modelname'])}")
        facts.append("Version: ComfyUI")
        return "\n".join(parts + [", ".join(facts)])
