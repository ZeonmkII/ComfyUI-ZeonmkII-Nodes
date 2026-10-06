# ComfyUI-ZeonmkII-Nodes

Custom nodes for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by ZeonmkII.

## Nodes

| Node | What it does |
|---|---|
| 🌀 **Character Swap** | LoRA-backed character switching — swap a prompt token for a character's trigger word, up to 8 slots, manual or random. |
| 🔗 **LoRAs Loader** | Stack many LoRAs in one node — Pixaroma-style rows with eye toggles, memory modes, Civitai info, and trigger auto-tick. |
| 🎲 **Load Random Image** | Pick a random image from a folder — native OS folder browse, live picked/left stats band, no-repeat cache with auto-reshuffle, seeded for reproducible sheets. Relative paths welcome — 'ComfyUI/input/' resolves on any install. |
| 🎲 **Load Random Prompt** | Pick a prompt from a text file or folder of .txt files — random / tracked-random / sequential modes, live used/left stats, instant cache reset, seeded. Ported from the classic Random Prompt Loader v3. Relative paths welcome — 'ComfyUI/input/' resolves on any install. |
| 📐 **Resolution** | Krea-2-style resolution presets as horizontal chip rows — orientation, ratio families, base sizes, live pixel readout. |
| ⏱ **Run Timer** | Wall-clock run timer with running / done / error states, CRT-style digits. |
| 💾 **Save Image** | Full [comfy-image-saver](https://github.com/girishgopaul/comfy-image-saver) parity — every field a native, hand-editable widget — plus a native OS folder-browse dialog and live filename preview. |
| 🔢 **INT** / 〰️ **FLOAT** | Tiny typed literal boxes (ComfyLiterals style) — step-tamed decimal display, no exponent soup. One wire into any INT/FLOAT input. |
| 🎛 **Sampler Selector** / 🕒 **Scheduler Selector** | Name-only dropdowns (comfy-image-saver style) — STRING out into the saver's sampler/scheduler metadata slots or KSampler via convert-to-input. |

## Install

Clone or download into your ComfyUI `custom_nodes` folder and restart ComfyUI:

```
git clone https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes.git
```

### Dependencies

The pack ships a `requirements.txt` — **ComfyUI-Manager installs it automatically** on install/update. For a manual install there is exactly one dependency:

```
pip install piexif
```

(needed by 💾 Save Image for EXIF metadata in JPEG/WebP; portable Windows installs: `python_embeded\python.exe -m pip install piexif`)

Everything else uses packages ComfyUI already bundles (torch, Pillow, etc.).

Find the nodes under the **ZeonmkII** category, or search "zeon" in the node menu.

## 💾 Save Image

Vendored **verbatim** from comfy-image-saver (MIT © 2023 Girish Gopaul — see `nodes/saver_lib/`), so every input works exactly like upstream: filename tokens (`%width%`, `%seed%`, `%modelname%`, `%counter%`, …), extension/quality controls, workflow-JSON sidecar save, PNG metadata embedding.

**Civitai upload helpers default OFF** — `download_civitai_data` and `easy_remix` only polish metadata for uploads to civitai.com. Your PNGs always embed the full workflow and prompt regardless, so private saves lose nothing; flip both ON for a save you plan to upload.

Two additions on top:

- **📁 Browse** — opens the real OS folder dialog on the machine running ComfyUI. Picking a folder there approves it permanently (stored in ComfyUI's user directory); the dialog is the only thing that can approve a folder. Saving anywhere under ComfyUI's own input/output/temp folders always works without approval.
- **Filename preview** — a live line under the path field showing where the next file lands, with `%width%` / `%height%` filled from the node and `%counter%` previewed as `00001`.

## 🌀 Character Swap

Loads a character LoRA and swaps a token in your prompt for that character's trigger word — with up to 8 characters to switch between, manually or at random.

**Features**

- **8 character slots** — each slot holds a LoRA, trigger word, and model/CLIP strengths. Slots appear as you raise `char_count`.
- **Token swap** — put `<char>` (or any token you choose) anywhere in your prompt; every occurrence becomes the selected character's trigger word.
- **Manual or random** — pick a slot yourself, or let the node roll between `random_min` and `random_max` from a connectable `random_seed`.
- **Enable toggles** — bench a character without deleting her setup; benched characters are skipped by random picks.
- **Text-only characters** — set a slot's LoRA to `None` and the swap happens without loading anything.

### Usage

1. Add **🌀 Character Swap ZeonmkII** and set `char_count` to your number of characters.
2. Fill each slot: LoRA file, trigger word, strengths.
3. Write the token into your prompt — e.g. "a photo of `<char>` in a garden".
4. Connect your `model` and `clip` in; the outputs go to your sampler like a normal LoRA Loader, and the swapped `text` goes to your CLIP encode.
5. Choose `manual` + `selection`, or `random` — connect a seed node to `random_seed` for reproducible picks.

### Inputs

| Input | What it does |
|---|---|
| `model`, `clip` | The selected character's LoRA is applied on top. |
| `text` | Your prompt, containing the token. |
| `token` | Placeholder to replace. Default `<char>`. |
| `char_count` | Number of character slots (1–8). |
| `select_mode` | `manual` uses `selection`; `random` picks among enabled slots. |
| `selection` | Which slot to use in manual mode. |
| `random_seed` | Random mode seed. Connectable. |
| `random_min` / `random_max` | Random pick range. |

Each slot has: `enabled`, `lora`, `trigger`, `strength_model`, `strength_clip`.

### Outputs

| Output | What it is |
|---|---|
| `model`, `clip` | With the selected character's LoRA applied. |
| `text` | Your prompt with the token swapped. |
| `chosen_index` | Which slot was used. |
| `chosen_name` | The trigger word used — handy for filenames or image metadata. |

## License

MIT © 2026 ZeonmkII

This pack builds on two MIT-licensed projects — their full license texts are
reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md):

- The **LoRAs Loader** node (Python + front-end) is a port of the LoRA Loader
  from [ComfyUI-Pixaroma](https://gitlab.com/pixaroma/ComfyUI-Pixaroma)
  (MIT © 2026 pixaroma) — rebranded, trimmed, and restyled for ZeonmkII.
- The image-saver core (`nodes/saver_lib/`) is vendored verbatim from
  [comfy-image-saver](https://github.com/girishgopaul/comfy-image-saver)
  (MIT © 2023 Girish Gopaul), so its behavior matches upstream exactly.
