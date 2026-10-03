"""
Load Random Prompt ZeonmkII — stats + cache-reset routes.

Read-only companions to the node's tracking cache, mirroring the Random
Image routes' trust model: ComfyUI roots are always fine; any OTHER path
must already be on the approved list (the native OS dialog is the only
thing that adds to it). Cache scheme mirrors nodes/random_prompt.py
(v3 verbatim): single_file → "<file>.cache.json" holding line INDICES,
folder → "<folder>/.comfyui_prompt_cache.json" holding FILENAMES.
"""

import json
import os

from aiohttp import web

from server import PromptServer

from ._folder_guard import prescreen, folder_allowed
from ._paths import resolve_path


def _cache_file_for(path, mode):
    if mode == "folder":
        return os.path.join(path, ".comfyui_prompt_cache.json")
    return path + ".cache.json"


def _load_used(cache_file):
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return set(data)
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            pass
    return set()


def _guarded(request_path):
    path = request_path or ""
    return bool(path) and prescreen(path) and folder_allowed(path)


@PromptServer.instance.routes.get("/zeonmkii/api/random_prompt/stats")
async def api_zeon_prompt_stats(request):
    """{ok:true,total,picked} for an approved prompt file/folder."""
    path = resolve_path(request.query.get("path", ""))
    mode = request.query.get("mode", "single_file")
    if not _guarded(path):
        return web.json_response({"ok": False, "reason": "unapproved"})

    if mode == "folder":
        if not os.path.isdir(path):
            return web.json_response({"ok": False, "reason": "missing"})
        try:
            names = [f for f in os.listdir(path)
                     if f.lower().endswith(".txt") and not f.startswith(".")]
        except OSError:
            return web.json_response({"ok": False, "reason": "unreadable"})
        used = _load_used(os.path.join(path, ".comfyui_prompt_cache.json"))
        picked = len(used & set(names))  # deleted files don't count
        return web.json_response({"ok": True, "total": len(names), "picked": picked})

    # single_file
    if not os.path.isfile(path):
        return web.json_response({"ok": False, "reason": "missing"})
    try:
        with open(path, "r", encoding="utf-8") as f:
            total = sum(1 for l in f if l.strip())
    except OSError:
        return web.json_response({"ok": False, "reason": "unreadable"})
    used = _load_used(path + ".cache.json")
    # indices may go stale after edits — only count ones that still exist
    picked = len([i for i in used if isinstance(i, int) and 0 <= i < total])
    return web.json_response({"ok": True, "total": total, "picked": picked})


@PromptServer.instance.routes.get("/zeonmkii/api/random_prompt/reset")
async def api_zeon_prompt_reset(request):
    """Delete the tracking cache file IMMEDIATELY (v0.16.1 design: the ♻
    button acts now, no sticky boolean ride-along)."""
    path = resolve_path(request.query.get("path", ""))
    mode = request.query.get("mode", "single_file")
    if not _guarded(path):
        return web.json_response({"ok": False, "reason": "unapproved"})
    if not (os.path.isdir(path) if mode == "folder" else os.path.isfile(path)):
        return web.json_response({"ok": False, "reason": "missing"})
    cache_file = _cache_file_for(path, mode)
    try:
        if os.path.exists(cache_file):
            os.remove(cache_file)
    except OSError:
        return web.json_response({"ok": False, "reason": "unreadable"})
    return web.json_response({"ok": True})
