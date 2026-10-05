"""ZeonmkII Model Name (v0.27.0) — pick the diffusion model ONCE.

ComfyUI's core loaders keep their model choice in a widget, so the name
never exists as a wire — which left the pipe's modelname field as the one
thing the user had to retype by hand. This node is the single source of
truth: one dropdown (the same diffusion_models list the loader shows),
one STRING output.

Wiring (once, when building the workflow):
  1. right-click Load Diffusion Model → Convert unet_name to Input
  2. wire this node's STRING → the loader's unet_name input
  3. wire this node's STRING → Pipe Insert value slot, target = modelname

The saver already resolves diffusion-model names for hashing (it checks
the diffusion_models folder after checkpoints), so Model: and Hashes:
fill from this one pick. Plain string output only — no IS_CHANGED, no
overrides (NaN-carrier doctrine, see any_to_string).
"""
import folder_paths


class ZeonmkIIModelName:
    @classmethod
    def INPUT_TYPES(cls) -> dict:
        files = folder_paths.get_filename_list("diffusion_models") or [""]
        return {
            "required": {
                "unet_name": (files, {
                    "tooltip": "pick once — this feeds BOTH the loader and the pipe",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("modelname",)
    OUTPUT_TOOLTIPS = ("the diffusion-model filename — into Load Diffusion Model's unet_name input (convert it to input first) and the Pipe's modelname",)
    FUNCTION = "pick"
    CATEGORY = "ZeonmkII"
    DESCRIPTION = "One dropdown, two wires: the loader loads it, the pipe records it"

    def pick(self, unet_name: str) -> tuple:
        return (unet_name,)
