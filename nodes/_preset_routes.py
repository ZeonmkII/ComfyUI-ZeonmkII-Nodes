"""ZeonmkII Presets — save/load whole-node configs as machine-local JSON files.

Boss's spec (Oct 3, SPARK 3): a small button at the corner of the two complex
nodes (LoRAs Loader, Character Swap) that saves the node's config under a
user-chosen name, and a load button that picks one of those names back. Kills
the backup-clone-node habit that bloats workflows.

Storage, per Boss's words: /custom_nodes/<our-node-dir>/user/<kind>/<name>.json
— machine-local by design (Y520's presets are Y520's, MAGI's are MAGI's) and
gitignored so user data never enters the repo.

Route family follows the pack's proven pattern (_lora_routes & co.): always-200
JSON with ok flags, isinstance guards on every body, name sanitization plus a
containment re-check so no crafted name can write outside its kind folder.
Writes are atomic (tmp + os.replace): a crash mid-save never leaves half a
preset behind.
"""
import json
import os
import re
import time

from aiohttp import web
from server import PromptServer

_KINDS = ("lora_stack", "charswap")   # one folder per node kind, nothing else
_MAX_JSON_BYTES = 1024 * 1024        # a stack config is a few KB; 1 MB is generous
_MAX_NAME = 64

_NAME_BAD = re.compile(r"[^A-Za-z0-9_\- ]+")


def _presets_root():
    """<pack>/user — this file is nodes/_preset_routes.py, so the pack root is
    two dirname hops up."""
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "user")


def _kind_dir(kind):
    if kind not in _KINDS:
        return None
    return os.path.join(_presets_root(), kind)


def sanitize_name(raw):
    """User-typed name -> safe filename stem. Everything but letters, digits,
    space, underscore and dash is dropped; 64 chars max. With separators and
    dots gone, path traversal is structurally impossible — the caller still
    re-checks containment as belt and suspenders."""
    name = _NAME_BAD.sub("", str(raw or "")).strip()
    if not name:
        return None
    return name[:_MAX_NAME]


def _preset_path(kind, name):
    """(dir, file) for a preset, or (None, None) if the kind or name is bad."""
    d = _kind_dir(kind)
    if not d:
        return None, None
    stem = sanitize_name(name)
    if not stem:
        return None, None
    p = os.path.join(d, stem + ".json")
    try:
        rp, rd = os.path.realpath(p), os.path.realpath(d)
        if rp != os.path.join(rd, os.path.basename(p)):
            return None, None
    except Exception:
        return None, None
    return d, p


@PromptServer.instance.routes.get("/zeonmkii/api/presets/{kind}/list")
async def api_presets_list(request):
    """Every saved preset for one node kind, newest first."""
    hdrs = {"Cache-Control": "no-store"}
    d = _kind_dir(request.match_info.get("kind", ""))
    if not d:
        return web.json_response({"ok": False, "message": "Unknown node kind."}, headers=hdrs)
    out = []
    try:
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            fp = os.path.join(d, fn)
            try:
                out.append({"name": fn[:-5], "mtime": int(os.path.getmtime(fp))})
            except OSError:
                continue
    except FileNotFoundError:
        return web.json_response({"ok": True, "presets": []}, headers=hdrs)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not list: {}".format(exc)}, headers=hdrs)
    out.sort(key=lambda e: (-e["mtime"], e["name"].lower()))
    return web.json_response({"ok": True, "presets": out}, headers=hdrs)


@PromptServer.instance.routes.post("/zeonmkii/api/presets/{kind}/save")
async def api_presets_save(request):
    """Save one preset. Body: {name, state}. Same name = overwrite."""
    hdrs = {"Cache-Control": "no-store"}
    kind = request.match_info.get("kind", "")
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    name = sanitize_name(body.get("name", ""))
    state = body.get("state")
    if not name:
        return web.json_response({
            "ok": False,
            "message": "Give the preset a name (letters, digits, spaces, - and _).",
        }, headers=hdrs)
    if not isinstance(state, dict):
        return web.json_response({"ok": False, "message": "Nothing to save."}, headers=hdrs)
    try:
        blob = json.dumps(
            {"version": 1, "kind": kind, "name": name,
             "saved_at": int(time.time()), "state": state},
            ensure_ascii=False)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not encode: {}".format(exc)}, headers=hdrs)
    if len(blob.encode("utf-8")) > _MAX_JSON_BYTES:
        return web.json_response({"ok": False, "message": "That config is too large to save."}, headers=hdrs)
    d, p = _preset_path(kind, name)
    if not p:
        return web.json_response({"ok": False, "message": "Unknown node kind or bad name."}, headers=hdrs)
    try:
        os.makedirs(d, exist_ok=True)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(blob)
        os.replace(tmp, p)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not save: {}".format(exc)}, headers=hdrs)
    return web.json_response({"ok": True, "name": name}, headers=hdrs)


@PromptServer.instance.routes.get("/zeonmkii/api/presets/{kind}/get")
async def api_presets_get(request):
    """Read one preset back. ?name= selects it."""
    hdrs = {"Cache-Control": "no-store"}
    kind = request.match_info.get("kind", "")
    name = request.query.get("name", "")
    d, p = _preset_path(kind, name)
    if not p:
        return web.json_response({"ok": False, "message": "Unknown node kind or bad name."}, headers=hdrs)
    try:
        with open(p, "r", encoding="utf-8") as f:
            blob = json.load(f)
    except FileNotFoundError:
        return web.json_response({"ok": False, "message": "No preset named \"{}\".".format(name)}, headers=hdrs)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not read: {}".format(exc)}, headers=hdrs)
    state = blob.get("state") if isinstance(blob, dict) else None
    if not isinstance(state, dict):
        return web.json_response({"ok": False, "message": "That preset file is not valid."}, headers=hdrs)
    return web.json_response({"ok": True, "name": blob.get("name", name), "state": state}, headers=hdrs)
