"""ZeonmkII typed literals + selectors (v0.32.1) — the KSampler plug kit.

Boss spec (Oct 5, item [3]): small, unbloated value nodes to wire into
KSampler and the saver —
  • INT / FLOAT number boxes, ComfyLiterals style. The core primitive float
    renders small values as exponent soup (1e-7, single exponent digit) —
    a declared step of 0.01 keeps the box decimal forever.
  • Sampler / Scheduler Selector, comfy-image-saver style: name-only
    dropdowns whose COMBO-typed output drives real KSampler nodes
    (converted inputs) and still feeds the saver's sampler_name /
    scheduler_name STRING slots directly.

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
    """Live sampler list from the running ComfyUI, static fallback last.
    KSampler.SAMPLERS first — it is the exact list KSampler's own combo
    shows, so dropdown and wire type can never drift."""
    try:
        import comfy.samplers
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SAMPLERS", None):
            return list(ks.SAMPLERS)
        names = getattr(comfy.samplers, "SAMPLER_NAMES", None)
        if names:
            return list(names)
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
    """Live scheduler list from the running ComfyUI, static fallback last.
    KSampler.SCHEDULERS first — same no-drift reasoning as samplers."""
    try:
        import comfy.samplers
        ks = getattr(comfy.samplers, "KSampler", None)
        if ks is not None and getattr(ks, "SCHEDULERS", None):
            return list(ks.SCHEDULERS)
        names = getattr(comfy.samplers, "SCHEDULER_NAMES", None)
        if names:
            return list(names)
    except Exception:
        pass
    try:
        from nodes import KSampler
        if getattr(KSampler, "SCHEDULERS", None):
            return list(KSampler.SCHEDULERS)
    except Exception:
        pass
    return list(_FALLBACK_SCHEDULERS)


# Combo-typed outputs (Boss 10:02): the selectors also drive real KSampler
# nodes, so the wire must BE the combo type — RETURN_TYPES carries the list
# itself (the comfy-image-saver pattern). A combo output still feeds STRING
# inputs (the saver's slots), but now it plugs into KSampler's sampler /
# scheduler combo inputs with a proper type match too. Baked at import from
# the same source as the dropdown, so the two can never drift; a restart
# refreshes both.
SAMPLER_COMBO = _sampler_names()
SCHEDULER_COMBO = _scheduler_names()


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
        names = list(SAMPLER_COMBO)
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
        names = list(SCHEDULER_COMBO)
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
