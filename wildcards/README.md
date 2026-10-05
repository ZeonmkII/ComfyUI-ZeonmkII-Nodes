# Pack-local wildcards

Drop your wildcard `.txt` files here — machine-local, git-ignored, never committed.

- `__name__` resolves to `wildcards/name.txt` (one option per line; `#` comments and blank lines skipped)
- Search order: ComfyUI-registered wildcards folders, then `<ComfyUI>/wildcards/`, then this folder
- Content is read fresh on every execution — edit a file, re-queue, no restart needed
