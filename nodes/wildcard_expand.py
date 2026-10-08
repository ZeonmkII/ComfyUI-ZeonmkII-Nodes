"""
Wildcard Expand ZeonmkII — seeded { a | b } + nesting + __file__ wildcards.

Compact core of the classic wildcard engines (Impact Pack compatible file
layout), clean-room per the 2026-10-05 design session:
  • { option A | option B | option C } — seeded pick, one survivor
  • nesting — { a | { b | c } } resolves innermost braces first
  • __name__ — one random line from wildcards/name.txt, searched across
    every folder registered as "wildcards" (so existing Impact files work
    unchanged). Chosen lines may themselves contain braces or further
    __refs__ — resolution keeps going until stable.
  • comments (#) and blank lines in wildcard files are skipped
  • weights (v0.33.0, Boss 11:28 — his prompts already carry the syntax):
    {2::a | b} or {2::a | 3::b} — per-option N:: prefix (Dynamic Prompts
    style, positive int/float, default 1). Weight 0 never picks; all-zero
    falls back uniform. File-picked lines re-enter resolution, so weighted
    braces inside wildcard files work too.
  • branches are verbatim (v0.35.7): spacing carries meaning —
    "on{| top of} her" → "on her" / "on top of her". An empty branch is a
    real branch (a chance to delete the phrase); doubled spaces left by
    padded branches collapse after full expansion.

Same law as the rest of the pack: a pure function of (text, seed). It is
stateless — no disk cache, nothing advances — so XY sweeps freeze it for
free via the driver's seed pinning; no lock machinery needed.

Unknown __refs__ are left visible in the output instead of silently
emptying, so a typo self-diagnoses on sight.
"""

import os
import random
import re

import folder_paths

# Substitution round cap — also bounds pathological __file__ cycles
# (a file whose expansion re-references itself forever).
_MAX_PASSES = 32
# __name__ where name = any run of characters that isn't an underscore,
# or a single underscore not followed by another (so my_file works and the
# closing __ is found greedily-enough-but-not-too-much).
_RE_REF = re.compile(r"__((?:[^_]|_(?!_))+?)__")
# Innermost { ... } — a brace group containing no other brace group.
_RE_INNERMOST = re.compile(r"\{([^{}]*)\}")
# Per-option weight prefix: "2::option" (positive int/float, Dynamic
# Prompts style). Matched at option-parse time; default weight is 1.
# v0.35.7: leading whitespace is consumed by the match itself so branches
# never need pre-stripping (verbatim branch text).
_RE_WEIGHT = re.compile(r"^\s*(\d+(?:\.\d+)?)::\s*")


def _wildcard_roots():
    # 1) every folder registered under the "wildcards" key (Impact and
    #    friends register their wildcards dir here — NOT guaranteed: some
    #    installs never register the key and get_folder_paths raises).
    #    A missing key is the NORMAL case (fallbacks below cover it), so
    #    stay silent — only unexpected lookup errors print once.
    roots = []
    try:
        roots.extend(p for p in folder_paths.get_folder_paths("wildcards") if p)
    except KeyError:
        pass   # no "wildcards" key registered on this install — expected
    except Exception as _e:
        print(f"[ZeonmkII Wildcard] registered-folder lookup failed (once): {_e}")
    # 2) ComfyUI root /wildcards — the common convention
    try:
        base = getattr(folder_paths, "base_path", None)
        if base:
            roots.append(os.path.join(base, "wildcards"))
    except Exception:
        pass
    # 3) pack-local wildcards/ — ships with the pack
    roots.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "wildcards"))
    return roots


def _wildcard_file(name):
    # Exact path first (name may already carry .txt or a subfolder).
    for root in _wildcard_roots():
        for candidate in (os.path.join(root, name), os.path.join(root, name + ".txt")):
            if os.path.isfile(candidate):
                return candidate
    # Recursive fallback — Impact keeps wildcards in subfolders and its own
    # names may or may not carry the subpath, so a bare-name ref like
    # __hair__ should still find wildcards/text/hair.txt.
    target = name.lower()
    for root in _wildcard_roots():
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if f.lower() in (target, target + ".txt"):
                    return os.path.join(dirpath, f)
    return None


def _file_options(path):
    opts = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    opts.append(line)
    except OSError:
        pass
    return opts


class ZeonmkIIWildcardExpand:
    DESCRIPTION = (
        "Expand { a | b } choices and __wildcard__ references into one "
        "final string, seeded — same seed, same expansion. Reads the same "
        "wildcards/ folder as Impact Pack, so existing files just work."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "photo of { a woman | a man } in __location__",
                    "tooltip": "Text with { a | b } choices and/or __wildcard__ references (one random line each). Weights work: {2::a | b} picks a twice as often. Nesting works; the seed decides every pick.",
                }),
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF,
                    "tooltip": "Seed for every choice — same seed, same expansion.",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("expanded",)
    FUNCTION = "expand"
    CATEGORY = "ZeonmkII"

    def expand(self, text, seed):
        rng = random.Random(seed)
        dead = set()   # refs that resolved to nothing — leave them visible
        out = text or ""

        def pick_ref(m):
            name = m.group(1).strip()
            if not name or name in dead:
                return m.group(0)
            path = _wildcard_file(name)
            options = _file_options(path) if path else None
            if not options:
                dead.add(name)
                if len(dead) <= 3:   # log the first few misses, not a flood
                    print(f"[ZeonmkII Wildcard] __{name}__ not found — roots searched: " + ", ".join(_wildcard_roots()))
                return m.group(0)
            return rng.choice(options)

        for _ in range(_MAX_PASSES):
            # 1) innermost { ... } choices until none remain
            m = _RE_INNERMOST.search(out)
            while m:
                # Weighted parse (v0.33.0): "2::a" → ("a", 2.0); bare "a" → 1.0.
                # Weight and text append together so they can never desync.
                options, weights = [], []
                for raw in m.group(1).split("|"):
                    # v0.35.7: branches are VERBATIM — spacing carries
                    # meaning ("on{| top of} her" → "on her" / "on top of
                    # her"). An empty branch is a real branch (a chance to
                    # delete the phrase); a whitespace-only body (bare " "
                    # or a weight prefix with nothing after it) counts as
                    # empty.
                    w = _RE_WEIGHT.match(raw)
                    weight = float(w.group(1)) if w else 1.0
                    if w:
                        raw = raw[w.end():]
                    options.append(raw if raw.strip() else "")
                    weights.append(max(0.0, weight))
                if not options:
                    repl = ""
                elif sum(weights) <= 0:
                    repl = rng.choice(options)   # all-zero weights → uniform
                elif all(w == 1.0 for w in weights):
                    repl = rng.choice(options)   # unweighted → uniform; same seed, same pick (per version)
                else:
                    repl = rng.choices(options, weights=weights, k=1)[0]
                out = out[:m.start()] + repl + out[m.end():]
                m = _RE_INNERMOST.search(out)
            # 2) expand every wildcard ref once (each pick may inject new
            #    braces, resolved on the next pass)
            expanded = _RE_REF.sub(pick_ref, out)
            if expanded == out:
                break   # stable — no live refs left
            out = expanded

        # v0.35.7: verbatim/padded branches can leave doubled spaces —
        # collapse space/tab runs to one, then trim the output's own ends
        # (newlines and interior spacing untouched).
        out = re.sub(r"[ \t]{2,}", " ", out).strip()
        return (out,)

# Registry mappings live in __init__.py — the pack's single source of truth.
