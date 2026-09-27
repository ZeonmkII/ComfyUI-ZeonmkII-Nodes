# ComfyUI-ZeonmkII-Nodes

Custom nodes for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by ZeonmkII.

## 🌀 Character Swap

Loads a character LoRA and swaps a token in your prompt for that character's trigger word — with up to 8 characters to switch between, manually or at random.

**Features**

- **8 character slots** — each slot holds a LoRA, trigger word, and model/CLIP strengths. Slots appear as you raise `char_count`.
- **Token swap** — put `<char>` (or any token you choose) anywhere in your prompt; every occurrence becomes the selected character's trigger word.
- **Manual or random** — pick a slot yourself, or let the node roll between `random_min` and `random_max` from a connectable `random_seed`.
- **Enable toggles** — bench a character without deleting her setup; benched characters are skipped by random picks.
- **Text-only characters** — set a slot's LoRA to `None` and the swap happens without loading anything.

## Install

Clone or download into your ComfyUI `custom_nodes` folder and restart ComfyUI:

```
git clone https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes.git
```

Find the node under the **ZeonmkII** category, or search "zeon" in the node menu.

## Usage

1. Add **🌀 Character Swap (ZeonmkII)** and set `char_count` to your number of characters.
2. Fill each slot: LoRA file, trigger word, strengths.
3. Write the token into your prompt — e.g. "a photo of `<char>` in a garden".
4. Connect your `model` and `clip` in; the outputs go to your sampler like a normal LoRA Loader, and the swapped `text` goes to your CLIP encode.
5. Choose `manual` + `selection`, or `random` — connect a seed node to `random_seed` for reproducible picks.

## Inputs

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

## Outputs

| Output | What it is |
|---|---|
| `model`, `clip` | With the selected character's LoRA applied. |
| `text` | Your prompt with the token swapped. |
| `chosen_index` | Which slot was used. |
| `chosen_name` | The trigger word used — handy for filenames or image metadata. |

## License

MIT © 2026 ZeonmkII
