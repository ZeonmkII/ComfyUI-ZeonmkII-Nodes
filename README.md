# ComfyUI-ZeonmkII-Nodes

Utility nodes for [ComfyUI](https://github.com/comfyanonymous/ComfyUI), built around one idea: **workflow glue, not model plumbing.** These nodes never touch the inference path, so they behave identically on SDXL, Krea2, Z-Image, and any future model family.

## Nodes

### 🌀 Character Swap

A single node that handles **character swapping** — one of the most cluttered patterns in ComfyUI workflows.

**The problem it solves**

Swapping between different character LoRAs usually means building a small machine: one LoRA Loader per character, switches to route the right model and CLIP, a text node holding each character's trigger word, and a search-and-replace node to inject it into the prompt. That's easily 10–15 nodes for four characters — and every new character means wiring up another batch of them.

**Character Swap collapses all of that into one node:**

- **A dynamic character table** — set the character count and the slots appear. Each slot holds its own LoRA, trigger word, and model/CLIP strengths.
- **A token system** — write a placeholder (default `<char>`) anywhere in your prompt. The node replaces every occurrence with the selected character's trigger word. No renaming prompts when you switch characters.
- **Manual or random selection** — pick a character yourself, or let the node roll a seeded random pick between slots. Because the random seed is a connectable input, it plays nicely with global-seed nodes: same seed, same character.
- **Enable toggles** — temporarily bench a character without deleting her setup. Benched characters are skipped by random selection.

**Quick start**

1. Add **🌀 Character Swap (ZeonmkII)** (search "zeon").
2. Set **char_count** to the number of characters you use, then fill in each slot: LoRA file, its trigger word, strengths.
3. Connect your **model** and **clip**, and feed your prompt text into **text** — making sure it contains the **token** (e.g. "a photo of `<char>` in a garden").
4. Connect the outputs to your sampler like a normal LoRA Loader, and use the swapped **text** for your CLIP encode.
5. Choose **select_mode**: `manual` and set **selection**, or `random` for a seeded pick.

**Inputs**

| Input | What it does |
|---|---|
| `model`, `clip` | Your diffusion model and CLIP — the chosen character's LoRA is applied on top, using ComfyUI's standard loader path. |
| `text` | Your prompt. Should contain the **token** somewhere. |
| `token` | The placeholder to replace. Default `<char>`, change it to anything you like. |
| `char_count` | Number of visible character slots (1–8). |
| `select_mode` | `manual` uses **selection**; `random` picks among enabled slots between **random_min** and **random_max**. |
| `random_seed` | Used by random mode. Connect your global-seed node here for reproducible picks. |

Each character slot has:

| Slot field | What it does |
|---|---|
| `enabled` | Include this character in random selection. |
| `lora` | The character LoRA — or `None` for a text-only character (the swap still happens, no LoRA is applied). |
| `trigger` | This character's trigger word, written into the prompt in place of the token. Use the trigger your LoRA was trained with. |
| `strength_model` / `strength_clip` | LoRA strengths for this character. Defaults (1.0 / 0.3) are a good starting point for character LoRAs. |

**Outputs**

| Output | What it is |
|---|---|
| `model`, `clip` | Your model/clip with the selected character's LoRA applied. |
| `text` | Your prompt with the token replaced by the chosen character's trigger word. |
| `chosen_index` | Which slot was used (handy for metadata or testing). |
| `chosen_name` | The trigger word that was used — useful for filenames or image-saver metadata. |

**Notes**

- If a manually selected character is disabled, the node passes everything through untouched (no LoRA, no swap) rather than erroring.
- Swapping is a plain text replace and happens on every occurrence of the token.
- No inference-path code is modified — the node is safe across model families and ComfyUI updates that don't change the loader API.

## Roadmap

- [x] Character Swap
- [ ] Random Prompt Loader
- [ ] More workflow-glue utilities

## Install

Copy or clone this folder into your ComfyUI `custom_nodes` directory and restart ComfyUI:

```
git clone https://github.com/ZeonmkII/ComfyUI-ZeonmkII-Nodes.git
```

Find the nodes under the **ZeonmkII** category, or just search "zeon" in the node menu.

## License

[MIT](LICENSE) © 2026 ZeonmkII
