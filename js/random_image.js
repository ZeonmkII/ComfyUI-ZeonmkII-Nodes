/**
 * ComfyUI-ZeonmkII-Nodes — Random Image UI
 *
 * Skin only: crimson node + a 🎲 Roll Again toolbar button that shuffles
 * the seed (precision-safe 32-bit, like Character Swap v2's random pick).
 * All picking logic lives in nodes/random_image.py.
 */
import { app } from "/scripts/app.js";
import { applyNodeSkin, makeToolbar } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Random Image";

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.RandomImage",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        applyNodeSkin(node);

        makeToolbar(node, [
            {
                label: "🎲 Roll again",
                title: "Shuffle the seed so the next run picks a different image.",
                onClick() {
                    const w = node.widgets ? node.widgets.find((x) => x.name === "random_seed") : null;
                    if (w) w.value = Math.floor(Math.random() * 0xffffffff);
                },
            },
            {
                label: "♻ Reset cache",
                title: "Forget the already-picked history on the next run.",
                onClick() {
                    const w = node.widgets ? node.widgets.find((x) => x.name === "reset_cache") : null;
                    if (w) w.value = true;
                },
            },
        ]);
    },
});
