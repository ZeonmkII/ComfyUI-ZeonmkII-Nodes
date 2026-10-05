"""
Global Seed ZeonmkII — one seed knob for the whole sheet.

Single INT output: wire it into every generator's random_seed (Load Random
Prompt, Load Random Image) and any sampler seed, and one value coordinates
the whole run — change it and the sheet reproduces (or re-rolls) as one.

The widget is named `seed` on purpose: ComfyUI attaches the native
control_after_generate (fixed / increment / decrement / randomize) to INT
widgets with that name, so advancing works exactly like a sampler seed.
During a ZeonmkII XY Plot sweep the driver's existing seed lock pins this
widget across all cells (captured per node id, restored after the run), so
the global seed holds still while an axis sweeps — the sweep-respect law
(2026-10-05): nothing moves unless the user or an axis deliberately moves it.

v1 ruling (Boss, 2026-10-05): single INT output only. Grow later if a real
need shows.
"""


class ZeonmkIIGlobalSeed:
    DESCRIPTION = (
        "One seed for the whole sheet. Wire the INT output into every "
        "generator's random_seed and any sampler seed; the native seed "
        "control (fixed / increment / randomize) drives per-run advance. "
        "XY sweeps pin it automatically."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF,
                    "tooltip": "The one seed. Fixed / increment / randomize comes from the native seed control next to this widget — same law as a sampler seed.",
                }),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "pass_seed"
    CATEGORY = "ZeonmkII"

    def pass_seed(self, seed):
        return (seed,)

# Registry mappings live in __init__.py — the pack's single source of truth.
