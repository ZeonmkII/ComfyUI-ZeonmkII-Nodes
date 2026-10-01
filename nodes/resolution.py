"""
ZeonmkII Resolution — Krea 2 aspect-ratio presets, nothing else.

A focused cut of ComfyUI-Resolution-Master: only the Krea 2 preset list,
verbatim pixel values. Two dropdowns — aspect ratio and base size — cover
the complete official set:

  • base 1024 — Krea 2 Turbo's native tier and exactly the Krea 2 RAW
    preset list (both models share these numbers 1:1)
  • base 1536 — official ratios x1.5
  • base 2048 — official ratios x2 (~4.2 MP)

Note: the ultrawide official Krea 2 ratio is 2.35:1 Cinematic — what other
preset lists sometimes label "21:9". Values are copied from
Resolution-Master's preset_categories.js so our numbers match its 1:1.
"""


class ZeonmkIIResolution:
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

    DESCRIPTION = (
        "Krea 2 aspect-ratio presets in one node: pick a ratio and a base "
        "size, wire width/height into your latent. Base 1024 is Krea 2 "
        "Turbo's native tier and matches the Krea 2 RAW preset list exactly; "
        "1536 and 2048 are the official x1.5 and x2 tiers. Pixel values are "
        "copied 1:1 from ComfyUI-Resolution-Master."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "aspect_ratio": (list(cls.KREA2_PRESETS.keys()), {
                    "default": "16:9 Widescreen",
                    "tooltip": "Official Krea 2 ratios, verbatim from Resolution-Master's Krea 2 preset list. The ultrawide entry is 2.35:1 Cinematic (what some lists call 21:9).",
                }),
                "base_size": (cls.BASE_SIZES, {
                    "default": "1024",
                    "tooltip": "1024 = Turbo native / RAW presets (identical numbers). 1536 = x1.5. 2048 = x2 (~4.2 MP).",
                }),
            },
        }

    RETURN_TYPES = ("INT", "INT", "STRING")
    RETURN_NAMES = ("width", "height", "preset_label")
    FUNCTION = "get_resolution"
    CATEGORY = "ZeonmkII"

    def get_resolution(self, aspect_ratio, base_size):
        w, h = self.KREA2_PRESETS[aspect_ratio][int(base_size)]
        label = f"{aspect_ratio} ({base_size})"
        return (w, h, label)
