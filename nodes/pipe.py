"""ZeonmkII Pipe (v0.24.0) — the typed bundle for the save side.

Boss spec 2026-10-05 14:44 (Easy-Use screenshot in hand): three nodes, one cable.

  [sources] → [🔌 Pipe In] ─ZEON_PIPE─ [✏️ Pipe Edit] ─ZEON_PIPE─ [📤 Pipe Out] → 💾 Save Image

v0.24.0 (Boss 14:57): the capture-at-source chain —

  [🚰 Init] ─ [➕ Insert @ each stop]×N ─ [✏️ Edit] ─ [📤 Out (+VAE Decode)] → 💾 Save Image

Insert converts any output to a string and writes it into a chosen field
(mode: replace / comma-append). Out coerces inserted strings back to the
saver's native INT/FLOAT/BOOLEAN/combo types and accepts the decoded image
directly (decoded images are born right before save). Pipe In stays as the
all-at-once alternative.

- Pipe In: every Save Image field as a typed input, widgets identical to the
  saver's — whatever you don't wire rides its default into the pipe.
- Pipe Out: one socket per field, in the saver's exact input order — wire it
  straight down into 💾 ZeonmkII Save Image, sprawl gone.
- Pipe Edit: blank = keep. String overrides (prompts, filename, model…)
  plus a fresh image if connected. Numerics/combo/booleans ride the pipe
  untouched — widget-backed optional inputs always deliver a value in
  ComfyUI, so an untouched INT override would stomp wired data; change
  those at Pipe In. (String overrides are safe: blank means "keep".)

Field set mirrors ZeonmkIISaveImage.INPUT_TYPES verbatim (nodes/image_saver.py,
post-v0.13.0 cuts — no counter/custom/label/civitai). The 1st_/2nd_ names
can't be Python parameters, so everything moves through kwargs dicts —
same law as the saver itself.
"""
try:
    from nodes import MAX_RESOLUTION
except Exception:  # standalone / test contexts
    MAX_RESOLUTION = 16384

PIPE_TYPE = "ZEON_PIPE"
_EXTENSION_CHOICES = ["png", "jpeg", "jpg", "webp"]

try:
    from .any_to_string import _stringify  # the pack's ANY→STRING engine
except ImportError:  # standalone / test contexts
    def _stringify(v):
        return v if isinstance(v, str) else str(v)

# (name, comfy type, widget config) — saver's input order, verbatim defaults.
_FIELD_SPECS = [
    ("images", "IMAGE", None),
    ("filename", "STRING", {"default": "%time_%basemodelname_%seed", "multiline": False, "tooltip": "filename (available variables: %date, %time, %time_format<format>, %model, %width, %height, %seed, %counter, %counter<padding>, %sampler_name, %steps, %cfg, %scheduler_name, %basemodelname, %denoise, %clip_skip, %label)"}),
    ("path", "STRING", {"default": "", "multiline": False, "tooltip": "path to save the images (under Comfy's save directory)"}),
    ("extension", _EXTENSION_CHOICES, {"tooltip": "file extension/type to save image as"}),
    ("modelname", "STRING", {"default": "", "multiline": False, "tooltip": "model name (can be multiple, separated by commas)"}),
    ("1st_sampler_name", "STRING", {"default": "", "multiline": False, "tooltip": "1st KSampler pass - sampler name"}),
    ("1st_scheduler_name", "STRING", {"default": "normal", "multiline": False, "tooltip": "1st KSampler pass - scheduler name"}),
    ("1st_steps", "INT", {"default": 12, "min": 0, "max": 10000, "tooltip": "1st KSampler pass - steps"}),
    ("1st_cfg", "FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "tooltip": "1st KSampler pass - CFG"}),
    ("2nd_sampler_name", "STRING", {"default": "", "multiline": False, "tooltip": "2nd KSampler cleanup pass - sampler name"}),
    ("2nd_scheduler_name", "STRING", {"default": "normal", "multiline": False, "tooltip": "2nd KSampler cleanup pass - scheduler name"}),
    ("2nd_steps", "INT", {"default": 2, "min": 0, "max": 10000, "tooltip": "2nd KSampler cleanup pass - steps (0 = skip the pass in the metadata)"}),
    ("2nd_cfg", "FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "tooltip": "2nd KSampler cleanup pass - CFG (0 = skip the pass in the metadata)"}),
    ("positive", "STRING", {"default": "", "multiline": True, "placeholder": "positive prompt", "tooltip": "positive prompt"}),
    ("negative", "STRING", {"default": "", "multiline": True, "placeholder": "negative prompt", "tooltip": "negative prompt"}),
    ("seed_value", "INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "seed"}),
    ("width", "INT", {"default": 512, "min": 0, "max": MAX_RESOLUTION, "step": 8, "tooltip": "image width"}),
    ("height", "INT", {"default": 512, "min": 0, "max": MAX_RESOLUTION, "step": 8, "tooltip": "image height"}),
    ("denoise", "FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "tooltip": "denoise value"}),
    ("clip_skip", "INT", {"default": 0, "min": -24, "max": 24, "tooltip": "skip last CLIP layers (positive or negative value, 0 for no skip)"}),
    ("lossless_webp", "BOOLEAN", {"default": True, "tooltip": "if True, saved WEBP files will be lossless"}),
    ("quality_jpeg_or_webp", "INT", {"default": 100, "min": 1, "max": 100, "tooltip": "quality setting of JPEG/WEBP"}),
    ("optimize_png", "BOOLEAN", {"default": False, "tooltip": "if True, saved PNG files will be optimized (can reduce file size but is slower)"}),
    ("time_format", "STRING", {"default": "%Y-%m-%d-%H%M%S", "multiline": False, "tooltip": "timestamp format"}),
    ("save_workflow_as_json", "BOOLEAN", {"default": False, "tooltip": "if True, also saves the workflow as a separate JSON file"}),
    ("embed_workflow", "BOOLEAN", {"default": True, "tooltip": "if True, embeds the workflow in the saved image files"}),
    # v0.36.1 LoRA-stack recorder fields — APPENDED on purpose: Pipe Out sockets
    # are positional and existing workflows wire them by index, so new fields
    # must never go in the middle of this list.
    ("lora_stack", "STRING", {"default": "", "multiline": False, "tooltip": "active style-LoRA stack text (from LoRAs Loader's lora_stack output) -> Save Image's LoRAs: metadata line"}),
    ("character_loras", "STRING", {"default": "", "multiline": False, "tooltip": "active character LoRA text (from Character Swap's character_loras output) -> Save Image's LoRAs: metadata line"}),
]

_REQUIRED = ["images", "filename", "path", "extension"]

# String fields Pipe Edit may override (blank = keep) + images (connected = replace).
_EDITABLE_STRINGS = [
    "filename", "path", "modelname",
    "1st_sampler_name", "1st_scheduler_name",
    "2nd_sampler_name", "2nd_scheduler_name",
    "positive", "negative", "time_format",
    "lora_stack", "character_loras",
]

_FIELD_NAMES = [s[0] for s in _FIELD_SPECS]
_RETURN_TYPES = tuple(s[1] for s in _FIELD_SPECS)
_DEFAULTS = {s[0]: (s[2] or {}).get("default") for s in _FIELD_SPECS}
_SPEC_TYPES = {s[0]: s[1] for s in _FIELD_SPECS}
_TARGETS = [n for n in _FIELD_NAMES if n != "images"]
_SLOT_TARGET_DEFAULTS = ["modelname", "positive", "negative", "seed_value"]
_INSERT_SLOTS = 4


def _coerce(name, v):
    """Inserted values arrive as strings; the saver's sockets want natives."""
    t = _SPEC_TYPES[name]
    if v is None:
        d = _DEFAULTS.get(name)
        return t[0] if (d is None and isinstance(t, list)) else d
    if isinstance(t, list):  # combo (extension)
        s = str(v).strip()
        return s if s in t else t[0]
    if t == "INT":
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        try:
            return int(str(v).strip())
        except ValueError:
            try:
                return int(float(str(v).strip()))
            except ValueError:
                d = _DEFAULTS.get(name)
                return 0 if d is None else d
    if t == "FLOAT":
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
        try:
            return float(str(v).strip())
        except ValueError:
            d = _DEFAULTS.get(name)
            return 0.0 if d is None else d
    if t == "BOOLEAN":
        if isinstance(v, bool):
            return v
        s = str(v).strip().lower()
        if s in ("true", "1", "yes", "on"):
            return True
        if s in ("false", "0", "no", "off", ""):
            return False
        return bool(_DEFAULTS.get(name))
    if t == "STRING":
        return v if isinstance(v, str) else str(v)
    return v  # IMAGE and friends: never touch


class ZeonmkIIPipeIn:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        req, opt = {}, {}
        for name, typ, cfg in _FIELD_SPECS:
            (req if name in _REQUIRED else opt)[name] = (typ, cfg or {})
        return {"required": req, "optional": opt}

    RETURN_TYPES = (PIPE_TYPE,)
    RETURN_NAMES = ("pipe",)
    OUTPUT_TOOLTIPS = ("the save-side bundle — feed Pipe Edit or Pipe Out",)
    FUNCTION = "collect"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Collect every Save Image field into one typed cable"

    def collect(self, images, filename, path, extension, **kwargs):
        pipe = {
            "images": images,
            "filename": filename,
            "path": path,
            "extension": extension,
        }
        for name in _FIELD_NAMES:
            if name in pipe:
                continue
            v = kwargs.get(name)
            pipe[name] = _DEFAULTS.get(name) if v is None else v
        return (pipe,)


class ZeonmkIIPipeOut:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "pipe": (PIPE_TYPE, {"tooltip": "the chain — from Init / In / Insert / Edit"}),
            },
            "optional": {
                "images": ("IMAGE", {"tooltip": "connect VAE Decode here — replaces the pipe's image"}),
            },
        }

    RETURN_TYPES = _RETURN_TYPES
    RETURN_NAMES = tuple(_FIELD_NAMES)
    OUTPUT_TOOLTIPS = tuple(f"{n} → Save Image" for n in _FIELD_NAMES)
    FUNCTION = "expand"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Un-bundle the pipe — one socket per Save Image field, in the saver's order"

    def expand(self, pipe, **kwargs):
        src = dict(pipe)
        img = kwargs.get("images")
        if img is not None:
            src["images"] = img
        return tuple(_coerce(n, src.get(n, _DEFAULTS.get(n))) for n in _FIELD_NAMES)


class ZeonmkIIPipeEdit:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        specs = {s[0]: (s[1], s[2] or {}) for s in _FIELD_SPECS}
        opt = {name: specs[name] for name in _EDITABLE_STRINGS}
        opt["images"] = ("IMAGE", {"tooltip": "connect to replace the image riding the pipe"})
        return {
            "required": {
                "pipe": (PIPE_TYPE, {"tooltip": "bundle from Pipe In"}),
            },
            "optional": opt,
        }

    RETURN_TYPES = (PIPE_TYPE,)
    RETURN_NAMES = ("pipe",)
    OUTPUT_TOOLTIPS = ("the edited bundle — blank overrides were kept as-is",)
    FUNCTION = "edit"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Override values on the fly: type a string (blank = keep) or wire a fresh image"

    def edit(self, pipe, **kwargs):
        out = dict(pipe)
        for name in _EDITABLE_STRINGS:
            v = kwargs.get(name)
            if isinstance(v, str) and v.strip() != "":
                out[name] = v
        img = kwargs.get("images")
        if img is not None:
            out["images"] = img
        return (out,)


class ZeonmkIIPipeInit:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {"required": {}}

    RETURN_TYPES = (PIPE_TYPE,)
    RETURN_NAMES = ("pipe",)
    OUTPUT_TOOLTIPS = ("the empty pipe — every field at its saver default, no image yet",)
    FUNCTION = "start"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Start the pipe chain — insert values at each workflow stop, expand before Save Image"

    def start(self):
        pipe = {n: _DEFAULTS.get(n) for n in _FIELD_NAMES}
        pipe["images"] = None
        return (pipe,)


class ZeonmkIIPipeInsert:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        optional = {}
        for i in range(1, _INSERT_SLOTS + 1):
            optional[f"value_{i}"] = ("*", {
                "tooltip": "any output — e.g. the loader's ckpt_name STRING (not the MODEL object itself), sampler, steps, seed…",
            })
            optional[f"target_{i}"] = (_TARGETS, {
                "default": _SLOT_TARGET_DEFAULTS[i - 1],
                "tooltip": "which Save Image field this value lands in",
            })
            optional[f"mode_{i}"] = (["replace", "append"], {
                "default": "replace",
                "tooltip": "append comma-joins into the field (modelname multi-model style)",
            })
        return {
            "required": {
                "pipe": (PIPE_TYPE, {"tooltip": "the chain — from Init or an earlier Insert"}),
            },
            "optional": optional,
        }

    RETURN_TYPES = (PIPE_TYPE,)
    RETURN_NAMES = ("pipe",)
    OUTPUT_TOOLTIPS = ("the chain with this stop's values folded in",)
    FUNCTION = "insert"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "Capture-at-source: convert any output to a string and fold it into a pipe field"

    def insert(self, pipe, **kwargs):
        out = dict(pipe)
        for i in range(1, _INSERT_SLOTS + 1):
            v = kwargs.get(f"value_{i}")
            if v is None:
                continue
            target = kwargs.get(f"target_{i}") or _SLOT_TARGET_DEFAULTS[i - 1]
            if target not in _FIELD_NAMES:
                continue
            if target == "images":
                out["images"] = v  # raw pass-through — tensors are never stringified
                continue
            # v0.26.2 guard: pipe text fields take TEXT/NUMBER outputs only.
            # Anything else (MODEL/CLIP objects, lora-state lists…) gets repr'd
            # into garbage the saver comma-splits into fake checkpoint names —
            # the "Could not find full path to checkpoint \"(0.4\"" error wall.
            if not isinstance(v, (str, int, float, bool)):
                print(f"[ZeonmkII] Pipe Insert: value_{i} is a {type(v).__name__} — pipe fields take text/number outputs only "
                      f"(wire name/string outputs, not model objects); '{target}' left unchanged")
                continue
            s = _stringify(v)
            if not isinstance(s, str) or s.strip() == "":
                continue
            if " object at 0x" in s:
                print(f"[ZeonmkII] Pipe Insert: value_{i} stringified to an object repr — skipped, '{target}' left unchanged")
                continue
            mode = kwargs.get(f"mode_{i}", "replace")
            old = out.get(target)
            old_s = old if isinstance(old, str) else ("" if old is None else str(old))
            if mode == "append" and old_s.strip():
                if s not in [p.strip() for p in old_s.split(",")]:
                    out[target] = f"{old_s},{s}"  # dup = already in the list, leave as-is
            else:
                out[target] = s
        return (out,)
