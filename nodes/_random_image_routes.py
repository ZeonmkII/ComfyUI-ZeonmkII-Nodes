"""
Load Random Image ZeonmkII — stats route.

Read-only companion to the node's no-repeat cache: the UI's live band asks
"how many images / how many already picked / how many left" without running
the node. Trust model matches the pack's other folder routes (Pixaroma
port): ComfyUI roots are always fine; any OTHER folder must already be on
the approved list (the native OS dialog is the only thing that adds to it),
so a crafted request can't probe arbitrary disks for image counts.
"""

import json
import os

from aiohttp import web

from server import PromptServer

from ._folder_guard import prescreen, folder_allowed
from ._paths import resolve_path

# mirrors nodes/random_image.py load_random — keep in lockstep
VALID_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
CACHE_NAME = ".comfyui_image_cache.json"


@PromptServer.instance.routes.get("/zeonmkii/api/random_image/stats")
async def api_zeon_random_stats(request):
    """{ok:true,total,picked} for an approved image folder.
    Fails with reason 'unapproved' (not on the allowlist), 'missing' (no
    such directory) or 'unreadable' (listing failed)."""
    path = resolve_path(request.query.get("path", ""))
    if not path or not prescreen(path) or not folder_allowed(path):
        return web.json_response({"ok": False, "reason": "unapproved"})
    if not os.path.isdir(path):
        return web.json_response({"ok": False, "reason": "missing"})
    try:
        names = [
            f for f in os.listdir(path)
            if f.lower().endswith(VALID_EXTENSIONS)
            and os.path.isfile(os.path.join(path, f))
        ]
    except OSError:
        return web.json_response({"ok": False, "reason": "unreadable"})
    picked = 0
    cache_file = os.path.join(path, CACHE_NAME)
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                # intersect: files deleted since picking shouldn't count
                picked = len(set(json.load(f)) & set(names))
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            picked = 0
    return web.json_response({"ok": True, "total": len(names), "picked": picked})


@PromptServer.instance.routes.get("/zeonmkii/api/random_image/reset")
async def api_zeon_random_reset(request):
    """Delete the folder's no-repeat cache file IMMEDIATELY (Boss's design,
    v0.16.1: the ♻ button acts NOW — no sticky boolean ride-along). Same
    folder-guard trust model as stats."""
    path = resolve_path(request.query.get("path", ""))
    if not path or not prescreen(path) or not folder_allowed(path):
        return web.json_response({"ok": False, "reason": "unapproved"})
    if not os.path.isdir(path):
        return web.json_response({"ok": False, "reason": "missing"})
    cache_file = os.path.join(path, CACHE_NAME)
    try:
        if os.path.exists(cache_file):
            os.remove(cache_file)
    except OSError:
        return web.json_response({"ok": False, "reason": "unreadable"})
    return web.json_response({"ok": True})
