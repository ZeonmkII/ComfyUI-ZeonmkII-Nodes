"""ZeonmkII typed literals + selectors (v0.32.2) — the KSampler plug kit.

Boss spec (Oct 5, item [3]): small, unbloated value nodes to wire into
KSampler and the saver —
  • INT / FLOAT number boxes, ComfyLiterals style. The core primitive float
    renders small values as exponent soup (1e-7, single exponent digit) —
    a declared step of 0.01 keeps the box decimal forever.
  • Sampler / Scheduler Selector, comfy-image-saver style: name-only
    dropdowns whose COMBO-typed output drives real KSampler nodes
    (converted inputs) and still feeds the saver's sampler_name /
    scheduler_name STRING slots directly.

v0.32.2 (Boss 11:00 field report): the selectors hand around comfy's LIVE
list objects — zero copies, zero snapshots. Pack-added samplers/schedulers
(RES4LYF & friends append to comfy's lists at THEIR import time, after we
load) stay visible on our dropdown AND our wire, because we never bake a
frozen copy. v0.32.1's import-time snapshot is the regression this fixes.

Native widgets only — no JS, no DOM hosting, nothing that can crash a
frontend. A static fallback keeps the module importable anywhere
(tests included). No IS_CHANGED, no overrides — NaN-carrier doctrine.
"""

_INT_MIN = -(2 ** 31)
_INT_MAX = 2 ** 31 - 1

# Offline fallbacks — inside ComfyUI the live lists always win.
_FALLBACK_SAMPLERS = [
    "euler", "euler_ancestral", "heun", "heunpp2",
    "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive",
    "dpmpp_2s_ancestral", "dpmpp_sde", "dpmpp_2m", "dpmpp_2m_sde",
    "dpmpp_3m_sde", "ddim", "uni_pc", "uni_pc_bh2", "lcm",
]
_FALLBACK_SCHEDULERS = [
    "normal", "karras", "exponential", "sgm_uniform", "simple",
    "ddim_uniform", "beta", "linear_quadratic", "kl_optimal",
]


def _live_samplers():
    """The LIVE sampler list object from the running ComfyUI — never copied.

    Holding the list itself (not a snapshot) means entries appended later by
    other packs appear here too. KSampler.SAMPLERS is the exact object core
    KSampler's own combo shows. Static fallback keeps imports alive outside
    ComfyUI."""
    try:
        import comfy.samplers
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SAMPLERS", None):
            return ks.SAMPLERS
        names = getattr(comfy.samplers, "SAMPLER_NAMES", None)
        if names:
            return names
    except Exception:
        pass
    try:
        from nodes import KSampler
        if getattr(KSampler, "SAMPLERS", None):
            return KSampler.SAMPLERS
    except Exception:
        pass
    return _FALLBACK_SAMPLERS


def _live_schedulers():
    """The LIVE scheduler list object — same no-snapshot law as samplers."""
    try:
        import comfy.samplers
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SCHEDULERS", None):
            return ks.SCHEDULERS
        names = getattr(comfy.samplers, "SCHEDULER_NAMES", None)
        if names:
            return names
    except Exception:
        pass
    try:
        from nodes import KSampler
        if getattr(KSampler, "SCHEDULERS", None):
            return KSampler.SCHEDULERS
    except Exception:
        pass
    return _FALLBACK_SCHEDULERS


# Combo-typed outputs: RETURN_TYPES carries the LIVE list object itself
# (the comfy-image-saver pattern, v0.32.1) — now with the no-snapshot law
# (v0.32.2). Resolved once at import for the class attribute, re-resolved
# fresh at every INPUT_TYPES call (schema build happens after ALL packs
# have loaded, so fresh resolves catch every pack's additions — and a
# browser refresh re-runs it). A combo output still feeds STRING inputs
# (the saver's slots).
SAMPLER_COMBO = _live_samplers()
SCHEDULER_COMBO = _live_schedulers()


class ZeonmkIIInt:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "int_value": ("INT", {
                    "default": 1, "min": _INT_MIN, "max": _INT_MAX,
                    "step": 1, "display": "number",
                    "tooltip": "plain integer — steps, seed offsets, anything",
                }),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("int",)
    OUTPUT_TOOLTIPS = ("the integer, unchanged",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "One number box, one INT wire — no bloat"

    def pick(self, int_value) -> tuple:
        return (int(int_value),)


class ZeonmkIIFloat:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        return {
            "required": {
                "float_value": ("FLOAT", {
                    "default": 1.0, "min": -1000000000.0, "max": 1000000000.0,
                    "step": 0.01, "round": 0.01, "display": "number",
                    "tooltip": "step 0.01 keeps the box decimal — no 1e-7 exponent soup",
                }),
            },
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("float",)
    OUTPUT_TOOLTIPS = ("the value, rounded to 6 decimals (never exponent-form)",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "One number box, one FLOAT wire — decimal display, no core-primitive exponent weirdness"

    def pick(self, float_value) -> tuple:
        return (round(float(float_value), 6),)


class ZeonmkIISamplerSelector:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        names = _live_samplers()
        return {
            "required": {
                "sampler_name": (names, {
                    "default": names[0] if names else "euler",
                    "tooltip": "name-only picker — combo wire into KSampler (convert to input), or straight into the saver's sampler_name",
                }),
            },
        }

    RETURN_TYPES = (SAMPLER_COMBO,)
    RETURN_NAMES = ("sampler_name",)
    OUTPUT_TOOLTIPS = ("the sampler name — combo wire for KSampler, also feeds Save Image metadata's string slot",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "The dropdown KSampler shows, as a combo wire (comfy-image-saver pattern)"

    def pick(self, sampler_name: str) -> tuple:
        return (sampler_name,)


class ZeonmkIISchedulerSelector:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        names = _live_schedulers()
        return {
            "required": {
                "scheduler_name": (names, {
                    "default": names[0] if names else "normal",
                    "tooltip": "name-only picker — combo wire into KSampler (convert to input), or straight into the saver's scheduler_name",
                }),
            },
        }

    RETURN_TYPES = (SCHEDULER_COMBO,)
    RETURN_NAMES = ("scheduler_name",)
    OUTPUT_TOOLTIPS = ("the scheduler name — combo wire for KSampler, also feeds Save Image metadata's string slot",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "The dropdown KSampler shows, as a combo wire (comfy-image-saver pattern)"

    def pick(self, scheduler_name: str) -> tuple:
        return (scheduler_name,)
