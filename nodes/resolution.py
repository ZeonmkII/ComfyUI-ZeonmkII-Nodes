"""
ZeonmkII Resolution — Krea 2 aspect-ratio presets, split by orientation.

v0.11.0 (Boss's round-2 note): Landscape and Portrait are SEPARATE groups —
an orientation dropdown plus one ratio dropdown per orientation (the
inactive one hides in the UI). 'BASE' is now 'Base Resolution'. The
ultrawide official Krea 2 ratio is 2.35:1 Cinematic (what some lists call
"21:9"). Pixel values verbatim from Resolution-Master's Krea 2 lists:

  • base 1024 — Krea 2 Turbo's native tier = Krea 2 RAW list (1:1 numbers)
  • base 1536 — official ratios x1.5
  • base 2048 — official ratios x2 (~4.2 MP)
"""

LANDSCAPE_RATIOS = [
    "4:3 Landscape",
    "3:2 Landscape",
    "16:9 Widescreen",
    "2.35:1 Cinematic",
    "1:1 Square",
]
PORTRAIT_RATIOS = [
    "4:5 Portrait",
    "3:4 Portrait",
    "2:3 Portrait",
    "9:16 Portrait",
    "1:1 Square",
]

# ratio -> base -> (width, height); verbatim from Resolution-Master
# 'Krea 2 Turbo' (bases 1024/1536/2048) — 'Krea 2 RAW' equals base 1024.
KREA2_PRESETS = {
    "1:1 Square": {1024: (1024, 1024), 1536: (1536, 1536), 2048: (2048, 2048)},
    "4:3 Landscape": {1024: (1184, 896), 1536: (1776, 1344), 2048: (2368, 1792)},
    "3:2 Landscape": {1024: (1248, 832), 1536: (1872, 1248), 2048: (2496, 1664)},
    "16:9 Widescreen": {1024: (1376, 768), 1536: (2064, 1152), 2048: (2752, 1536)},
    "2.35:1 Cinematic": {1024: (1568, 672), 1536: (2352, 1008), 2048: (3136, 1344)},
    "4:5 Portrait": {1024: (928, 1152), 1536: (1392, 1728), 2048: (1856, 2304)},
    "3:4 Portrait": {1024: (896, 1184), 1536: (1344, 1776), 2048: (1792, 2368)},
    "2:3 Portrait": {1024: (832, 1248), 1536: (1248, 1872), 2048: (1664, 2496)},
    "9:16 Portrait": {1024: (768, 1376), 1536: (1152, 2064), 2048: (1536, 2752)},
}
BASE_SIZES = ["1024", "1536", "2048"]


class ZeonmkIIResolution:
    DESCRIPTION = (
        "Krea 2 aspect-ratio presets in one node, split by orientation: pick "
        "Landscape or Portrait, then a ratio from that family, then a Base "
        "Resolution tier. Wire width/height into your latent. Pixel values "
        "are copied 1:1 from ComfyUI-Resolution-Master."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "orientation": (["Landscape", "Portrait"], {
                    "default": "Landscape",
                    "tooltip": "Which ratio family is active. The other family's dropdown hides in the UI.",
                }),
                "landscape_ratio": (LANDSCAPE_RATIOS, {
                    "default": "16:9 Widescreen",
                    "tooltip": "Landscape family (incl. Square). The ultrawide entry is 2.35:1 Cinematic — what some lists call 21:9.",
                }),
                "portrait_ratio": (PORTRAIT_RATIOS, {
                    "default": "4:5 Portrait",
                    "tooltip": "Portrait family (incl. Square).",
                }),
                "base_resolution": (BASE_SIZES, {
                    "default": "1024",
                    "tooltip": "Base Resolution: 1024 = Turbo native / RAW presets (identical numbers). 1536 = x1.5. 2048 = x2 (~4.2 MP).",
                }),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING")
    RETURN_NAMES = ("width", "height", "preset_label")
    FUNCTION = "get_resolution"
    CATEGORY = "ZeonmkII"

    def get_resolution(self, orientation, landscape_ratio, portrait_ratio, base_resolution):
        ratio = landscape_ratio if orientation == "Landscape" else portrait_ratio
        w, h = KREA2_PRESETS[ratio][int(base_resolution)]
        return (w, h, f"{ratio} ({base_resolution})")
