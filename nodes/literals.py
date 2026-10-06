"""ZeonmkII typed literals + selectors (v0.32.0) — the KSampler plug kit.

Boss spec (Oct 5, item [3]): small, unbloated value nodes to wire into
KSampler and the saver —
  • INT / FLOAT number boxes, ComfyLiterals style. The core primitive float
    renders small values as exponent soup (1e-7, single exponent digit) —
    a declared step of 0.01 keeps the box decimal forever.
  • Sampler / Scheduler Selector, comfy-image-saver style: name-only
    dropdowns whose STRING output feeds the saver's sampler_name /
    scheduler_name STRING slots directly, and KSampler after a stock
    convert-to-input — the same wiring Model Name already proven.

Native widgets only — no JS, no DOM hosting, nothing that can crash a
frontend. Lists are read live from the running ComfyUI with a static
fallback so the module imports anywhere (tests included).

No IS_CHANGED, no overrides — NaN-carrier doctrine (see any_to_string).
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


def _sampler_names() -> list:
    """Live sampler list from the running ComfyUI, static fallback last."""
    try:
        import comfy.samplers
        names = getattr(comfy.samplers, "SAMPLER_NAMES", None)
        if names:
            return list(names)
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SAMPLERS", None):
            return list(ks.SAMPLERS)
    except Exception:
        pass
    try:
        from nodes import KSampler
        if getattr(KSampler, "SAMPLERS", None):
            return list(KSampler.SAMPLERS)
    except Exception:
        pass
    return list(_FALLBACK_SAMPLERS)


def _scheduler_names() -> list:
    """Live scheduler list from the running ComfyUI, static fallback last."""
    try:
        import comfy.samplers
        names = getattr(comfy.samplers, "SCHEDULER_NAMES", None)
        if names:
            return list(names)
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SCHEDULERS", None):
            return list(ks.SCHEDULERS)
    except Exception:
        pass
    try:
        from nodes import KSampler
        if getattr(KSampler, "SCHEDULERS", None):
            return list(KSampler.SCHEDULERS)
    except Exception:
        pass
    return list(_FALLBACK_SCHEDULERS)


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
        names = _sampler_names()
        return {
            "required": {
                "sampler_name": (names, {
                    "default": names[0] if names else "euler",
                    "tooltip": "name-only picker — STRING out, straight into the saver's sampler_name or KSampler (convert to input)",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("sampler_name",)
    OUTPUT_TOOLTIPS = ("the sampler name — feeds Save Image metadata directly, KSampler after convert-to-input",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "The dropdown KSampler shows, as a wire (comfy-image-saver pattern)"

    def pick(self, sampler_name: str) -> tuple:
        return (sampler_name,)


class ZeonmkIISchedulerSelector:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        names = _scheduler_names()
        return {
            "required": {
                "scheduler_name": (names, {
                    "default": names[0] if names else "normal",
                    "tooltip": "name-only picker — STRING out, straight into the saver's scheduler_name or KSampler (convert to input)",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("scheduler_name",)
    OUTPUT_TOOLTIPS = ("the scheduler name — feeds Save Image metadata directly, KSampler after convert-to-input",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "The dropdown KSampler shows, as a wire (comfy-image-saver pattern)"

    def pick(self, scheduler_name: str) -> tuple:
        return (scheduler_name,)
