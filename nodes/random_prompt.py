"""
Load Random Prompt ZeonmkII — loads prompts from a file or folder.

Port of Boss's classic random_prompt_loader_v3 (NAS custom_nodes), wearing
the pack's skin and conventions. Three selection modes:
  1. random          — seeded pick each run
  2. tracked_random  — seeded pick that skips already-used items until all
                       are used, then reshuffles
  3. sequential      — first unused item in order (line order / name order)

Deliberate changes from v3 (flagged to Boss 2026-10-03):
  • PURE SEED: v3 mixed time.time_ns() into the seed, so runs could never
    be reproduced. Here the seed is the whole story — wire the global seed
    in and sheets reproduce exactly, same law as Random Image.
  • NO reset_cache input: cache resets happen NOW via the ♻ button and the
    /zeonmkii/api/random_prompt/reset route (v0.16.1 design). The old
    sticky-boolean failure mode can't exist here.
Cache scheme kept verbatim from v3: single_file → "<file>.cache.json"
(line indices), folder → "<folder>/.comfyui_prompt_cache.json" (filenames).

Sweep-respect (v0.20.0): the XY Plot driver injects a hidden xy_lock token
(plot sessionId + node key) into every generator it freezes for a plot run.
While locked, the FIRST execution picks WITHOUT consuming the disk cache and
records the result; every later cell replays the recording. Sequential and
tracked_random therefore hold still across a whole grid - nothing is marked
used, nothing advances, and after the sweep the node behaves exactly as
before. The source output carries a "[🔒 sweep]" suffix while locked so the
freeze is visible in saved metadata.
"""

import json
import os
import random
from collections import OrderedDict

from ._paths import resolve_path

# ── XY sweep lock state (module-level, LRU-capped) ─────────────────────────
_LOCK_MAX = 64
_SWEEP_PICKS = OrderedDict()   # token -> (prompt, source-with-badge)


def _sweep_get(token):
    if token in _SWEEP_PICKS:
        _SWEEP_PICKS.move_to_end(token)
        return _SWEEP_PICKS[token]
    return None


def _sweep_put(token, value):
    _SWEEP_PICKS[token] = value
    _SWEEP_PICKS.move_to_end(token)
    while len(_SWEEP_PICKS) > _LOCK_MAX:
        _SWEEP_PICKS.popitem(last=False)


class ZeonmkIIRandomPrompt:
    DESCRIPTION = (
        "Picks a prompt from a text file (one prompt per line) or a folder "
        "of .txt files. Seeded, so the same seed picks the same prompt. "
        "Tracked modes skip already-used prompts until everything has been "
        "used once, then reshuffle; sequential walks them in order."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["single_file", "folder"], {
                    "default": "single_file",
                    "tooltip": "Read lines from one text file, or one prompt per .txt file in a folder.",
                }),
                "path": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "placeholder": "ComfyUI/input/",
                    "tooltip": "Text file (single_file) or folder of .txt files (folder mode). Relative paths like 'ComfyUI/input/prompts.txt' resolve on any install.",
                }),
                "selection_mode": (["random", "tracked_random", "sequential"], {
                    "default": "tracked_random",
                    "tooltip": "random: any pick. tracked_random: no repeats until exhausted. sequential: in order.",
                }),
                "random_seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF,
                    "tooltip": "Seed for the pick — same seed, same prompt. Wire the global seed here for per-generation variety. (Named random_seed per pack law.)",
                }),
            },
            "hidden": {
                "xy_lock": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "source")
    FUNCTION = "pick_prompt"
    CATEGORY = "ZeonmkII"

    # ---------- cache helpers (v3 verbatim, minus the reset flag) ----------

    def _load_cache(self, cache_file):
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    return set(json.load(f))
            except (json.JSONDecodeError, IOError, OSError):
                try:
                    os.remove(cache_file)
                except OSError:
                    pass
        return set()

    def _save_cache(self, cache_file, used):
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(sorted(used), f)

    # ---------- main (v3 structure, pure seed) ----------

    def pick_prompt(self, mode, path, selection_mode, random_seed, xy_lock=""):
        path = resolve_path(path)

        if xy_lock:
            hit = _sweep_get(xy_lock)
            if hit is not None:
                return hit
            prompt, source = self._pick(mode, path, selection_mode, random_seed, consume=False)
            recorded = (prompt, source + " [🔒 sweep]")
            _sweep_put(xy_lock, recorded)
            return recorded

        prompt, source = self._pick(mode, path, selection_mode, random_seed, consume=True)
        return (prompt, source)

    def _pick(self, mode, path, selection_mode, random_seed, consume):
        if mode == "single_file":
            if not os.path.exists(path):
                raise Exception(f"Prompt file not found: {path}")

            with open(path, "r", encoding="utf-8") as f:
                lines = [l.strip() for l in f if l.strip()]

            if not lines:
                raise Exception(f"No prompts found in {path}")

            cache_file = path + ".cache.json"
            used = self._load_cache(cache_file)

            if selection_mode == "random":
                random.seed(random_seed)
                idx = random.choice(range(len(lines)))
                return (lines[idx], f"line {idx + 1} of {os.path.basename(path)}")

            # tracked_random + sequential share the no-repeat pool
            available = [i for i in range(len(lines)) if i not in used]
            if not available:
                used = set()
                available = list(range(len(lines)))
            if selection_mode == "tracked_random":
                random.seed(random_seed)
                idx = random.choice(available)
            else:  # sequential
                idx = available[0]
            if consume:
                used.add(idx)
                self._save_cache(cache_file, used)
            source = f"line {idx + 1} of {os.path.basename(path)}"
            if selection_mode == "sequential":
                source += f" (sequential {len(used)}/{len(lines)})"
            return (lines[idx], source)

        elif mode == "folder":
            if not os.path.isdir(path):
                raise Exception(f"Directory not found: {path}")

            files = [f for f in os.listdir(path)
                     if f.lower().endswith(".txt") and not f.startswith(".")]
            if not files:
                raise Exception(f"No .txt files found in {path}")
            files.sort()  # name order — the basis for sequential mode

            cache_file = os.path.join(path, ".comfyui_prompt_cache.json")
            used = self._load_cache(cache_file)

            if selection_mode == "random":
                random.seed(random_seed)
                chosen = random.choice(files)
            else:
                available = [f for f in files if f not in used]
                if not available:
                    used = set()
                    available = files
                if selection_mode == "tracked_random":
                    random.seed(random_seed)
                    chosen = random.choice(available)
                else:  # sequential
                    chosen = available[0]
                if consume:
                    used.add(chosen)
                    self._save_cache(cache_file, used)

            with open(os.path.join(path, chosen), "r", encoding="utf-8") as f:
                prompt = f.read().strip()
            source = f"file: {chosen}"
            if selection_mode == "sequential":
                source += f" (sequential {len(used)}/{len(files)})"
            return (prompt, source)

        raise Exception(f"Unknown mode: {mode}")

# Registry mappings live in __init__.py — the pack's single source of truth.
