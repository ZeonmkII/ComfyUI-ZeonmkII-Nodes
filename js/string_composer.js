/**
 * ComfyUI-ZeonmkII-Nodes — String Composer UI (v0.31.0)
 *
 * DOWNSIZED 2026-10-06 02:22, Boss's call: "let's do a simple (no dynamic)
 * 4 textbox string concatenate. that's it. keep the '\n' delimiter thing."
 *
 * The dynamic era (v0.26.0–v0.30.2: DOM rows, auto-grow, hidden widgets,
 * JS-added sockets) is RETIRED — it never survived the Nodes-2.0 frontend
 * (defineProperty throw since v0.26.0, then socket/row mismatches at 02:12).
 *
 * What remains is the native node: 4 multiline textboxes + separator,
 * all declared in nodes/text_blocks.py, all visible, nothing hidden,
 * nothing hosted, nothing to crash. Skin (red title) still comes from
 * zeonmkii_skin.js. Wiring a slot = standard right-click → Convert to
 * Input on the visible widget — stock ComfyUI, zero code of ours.
 *
 * This file is a greeting-only stub: no nodeCreated, zero hooks.
 */
import { app } from "/scripts/app.js";

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.StringComposer",
    setup() {
        console.info("[zeonmkii] sc: string_composer v0.31.0 online (static 4)");
    },
});
