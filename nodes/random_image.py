"""
Load Random Image ZeonmkII — loads a random image from a directory.

Same function as the classic LoadRandomImageFromDirectory node, wearing the
pack's skin: point it at a folder, it picks one image (seeded, so sheets
reproduce) and returns the image plus its filename. With exclude_selected
on, a cache file inside the directory remembers what has already been
picked and leaves those out until the folder is exhausted — then it resets
by itself. Random Image Loader + character sheets + seeded seeds = no
accidental repeats across a sheet run.
"""

import json
import os
import random

import numpy as np
import torch
from PIL import Image

from ._paths import resolve_path


def _pil2tensor(image):
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)


class ZeonmkIIRandomImage:
    DESCRIPTION = (
        "Picks one random image from a directory and outputs it plus its "
        "filename. Seeded, so the same seed always picks the same image. "
        "With 'exclude selected' on, already-picked images sit out until the "
        "folder is exhausted (tracked in a small cache file inside the "
        "directory), which keeps character sheets free of accidental repeats."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_directory": ("STRING", {
                    "multiline": False,
                    "placeholder": "ComfyUI/input/",
                    "tooltip": "Folder to pick from — absolute or relative ('ComfyUI/input/' and 'input' both resolve on any install: launch folder, ComfyUI root, then its parent).",
                }),
                "random_seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF,
                    "tooltip": "Seed for the pick — same seed, same image. Use the 🎲 Roll Again button on the node to shuffle. (Named random_seed, NOT seed, so the pack's dynamic nodes stay save/restore-safe.)",
                }),
            },
            "optional": {
                "exclude_selected": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Skip images already picked (tracked in .comfyui_image_cache.json inside the folder) until every image has been used once.",
                }),
                "reset_cache": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Forget the already-picked history on the next run.",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "filename")
    FUNCTION = "load_random"
    CATEGORY = "ZeonmkII"

    def load_random(self, image_directory, random_seed, exclude_selected=True, reset_cache=False):
        image_directory = resolve_path(image_directory)
        if not os.path.exists(image_directory):
            raise Exception(f"Image directory {image_directory} does not exist")

        cache_file = os.path.join(image_directory, ".comfyui_image_cache.json")

        if reset_cache and os.path.exists(cache_file):
            os.remove(cache_file)

        valid_extensions = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
        files = [
            f for f in os.listdir(image_directory)
            if os.path.isfile(os.path.join(image_directory, f)) and f.lower().endswith(valid_extensions)
        ]
        files.sort()

        if not files:
            raise Exception(f"No valid images found in {image_directory}")

        selected_files = set()
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r") as f:
                    selected_files = set(json.load(f))
            except (json.JSONDecodeError, IOError):
                selected_files = set()
                os.remove(cache_file)

        if exclude_selected:
            available_files = [f for f in files if f not in selected_files]
            if not available_files:
                # every image has been used once — start a fresh round
                selected_files = set()
                available_files = files
                if os.path.exists(cache_file):
                    os.remove(cache_file)
        else:
            available_files = files

        random.seed(random_seed)
        selected_file = random.choice(available_files)
        file_path = os.path.join(image_directory, selected_file)

        if exclude_selected:
            selected_files.add(selected_file)
            with open(cache_file, "w") as f:
                json.dump(list(selected_files), f)

        img = Image.open(file_path)
        return (_pil2tensor(img), selected_file)
