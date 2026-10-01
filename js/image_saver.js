/**
 * ComfyUI-ZeonmkII-Nodes — Save Image UI
 *
 * Skin only: crimson node. Naming/metadata logic lives entirely in
 * nodes/image_saver.py.
 */
import { app } from "/scripts/app.js";
import { applyNodeSkin } from "./zeonmkii_skin.js";

const NODE_CLASS = "ZeonmkII Save Image";

app.registerExtension({
    name: "ComfyUI-ZeonmkII-Nodes.SaveImage",

    nodeCreated(node) {
        if (node.comfyClass !== NODE_CLASS) return;
        applyNodeSkin(node);
    },
});
