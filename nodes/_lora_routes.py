"""ZeonmkII LoRAs Loader — server routes (the /zeonmkii/api/lora/* family).

Port of Pixaroma's LoRA Loader routes (server_routes.py, MIT): the file list,
the offline info + trigger-word readout, preview thumbnails, the user's own
trigger-word and preview stores, and the OPTIONAL (user-clicked) Civitai lookup
with its machine-local API key. Everything except the lookup is fully offline.
Every route realpath-guards to the configured loras directories so a crafted
?name= can't read outside them.
"""
import asyncio
import base64
import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer

from . import _lora_helpers as H


# ── guards ──────────────────────────────────────────────────────────────────

def _is_path_under(path, *roots):
    """Containment that survives a symlinked loras folder: realpath both sides."""
    try:
        rp = os.path.realpath(path)
    except Exception:
        return False
    for root in roots:
        try:
            rr = os.path.realpath(root)
        except Exception:
            continue
        if rp == rr or rp.startswith(rr + os.sep):
            return True
    return False


def _looks_like_image(raw):
    """Magic-byte check: this file is served straight back to a browser as an
    image, so one that is not would simply never render and read as a bug."""
    if not raw or len(raw) < 12:
        return False
    if raw[:3] == b"\xff\xd8\xff":                     # JPEG
        return True
    if raw[:8] == b"\x89PNG\r\n\x1a\n":                # PNG
        return True
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":    # WEBP
        return True
    if raw[:6] in (b"GIF87a", b"GIF89a"):              # GIF
        return True
    if raw[:2] == b"BM":                               # BMP
        return True
    return False


def _lora_dirs():
    try:
        return list(folder_paths.get_folder_paths("loras"))
    except Exception:
        return []


def _resolve_lora_path(name):
    """Resolve a LoRA filename (as listed, incl. any subfolder) to a real path that
    is guaranteed to live inside a configured loras directory, or None."""
    if not name or not isinstance(name, str):
        return None
    try:
        p = folder_paths.get_full_path("loras", name)
    except Exception:
        p = None
    if not p or not os.path.isfile(p):
        return None
    # Fail CLOSED: if the loras dirs can't be determined, refuse rather than
    # serve an unverified path.
    roots = _lora_dirs()
    if not roots or not _is_path_under(p, *roots):
        return None
    return p


# ── per-install storage (ComfyUI user dir, OUTSIDE this git repo) ──────────

def _user_store_dir():
    """<ComfyUI user dir>/zeonmkii — the Civitai key, custom trigger words and
    user preview pictures live here. Deliberately outside this plugin's folder
    (a git repo): a key in the working tree is one `git add -A` from being
    published, and a Manager reinstall would wipe it."""
    base = None
    try:
        base = folder_paths.get_user_directory()
    except Exception:
        base = None
    if not base:
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "user")
    d = os.path.join(base, "zeonmkii")
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d


def _civitai_account_file():
    return os.path.join(_user_store_dir(), "civitai.json")


def _civitai_account():
    return H.read_civitai_account(_civitai_account_file())


def _civitai_public_account(acc):
    """The ONLY shape the browser is ever given. The key itself never leaves the
    server: `configured` says whether there is one and `hint` shows its last four
    characters so the user can tell which key is loaded."""
    return {
        "ok": True,
        "configured": bool(acc.get("key")),
        "hint": H.mask_civitai_key(acc.get("key")),
        "host": acc.get("host", "com"),
        "adultThumbs": bool(acc.get("adult_thumbs")),
    }


def _lora_custom_file():
    return os.path.join(_user_store_dir(), "lora_triggers.json")


def _lora_previews_dir():
    return os.path.join(_user_store_dir(), "lora_previews")


def _lora_preview_path_checked(name):
    """The on-disk path for one of our LoRA preview files, or None if it is not
    one we could have written. Every route that writes, reads or deletes one
    gates on this."""
    folder = _lora_previews_dir()
    path = H.custom_preview_path(folder, name)
    if not path:
        return None
    return path if _is_path_under(path, folder) else None


_LORA_PREVIEW_MAX_BYTES = 4 * 1024 * 1024


# ── Civitai account (the optional API key) ─────────────────────────────────

@PromptServer.instance.routes.get("/zeonmkii/api/civitai/account")
async def api_civitai_account_get(request):
    """Whether a key is configured, and the two lookup preferences. Never the key."""
    return web.json_response(_civitai_public_account(_civitai_account()),
                             headers={"Cache-Control": "no-store"})


@PromptServer.instance.routes.post("/zeonmkii/api/civitai/account")
async def api_civitai_account_set(request):
    """Set the key and/or the preferences. An absent field is left alone; `key: ""`
    clears the key. Answers with the same public shape, so the panel repaints from
    what the server actually stored rather than from what it hoped it sent."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    acc = _civitai_account()
    if "key" in body:
        raw = body.get("key")
        if isinstance(raw, str) and raw.strip() == "":
            acc["key"] = ""
        else:
            k = H.sanitize_civitai_key(raw)
            if not k:
                return web.json_response({
                    "ok": False,
                    "message": "That does not look like an API key - it should be one "
                               "run of ordinary characters with no spaces.",
                }, headers={"Cache-Control": "no-store"})
            acc["key"] = k
    if body.get("host") in ("com", "red"):
        acc["host"] = body["host"]
    if "adultThumbs" in body:
        acc["adult_thumbs"] = bool(body.get("adultThumbs"))
    if not H.write_civitai_account(_civitai_account_file(), acc):
        return web.json_response({"ok": False, "message": "Could not save the settings file."},
                                 headers={"Cache-Control": "no-store"})
    return web.json_response(_civitai_public_account(acc), headers={"Cache-Control": "no-store"})


# ── LoRA list / info / thumb ────────────────────────────────────────────────

@PromptServer.instance.routes.get("/zeonmkii/api/lora/list")
async def api_lora_list(request):
    """Every LoRA filename ComfyUI knows about (names include any subfolder prefix)."""
    hdrs = {"Cache-Control": "no-store"}
    try:
        files = list(folder_paths.get_filename_list("loras"))
    except Exception:
        # A SCAN FAILURE is not an empty folder: the frontend treats a clean []
        # as ground truth and would mark every row "missing". Say so.
        return web.json_response({"loras": [], "error": True}, headers=hdrs)
    return web.json_response({"loras": files}, headers=hdrs)


@PromptServer.instance.routes.get("/zeonmkii/api/lora/info")
async def api_lora_info(request):
    """Offline info + trigger words for one LoRA (the info panel). Always 200 so the
    frontend never branches on HTTP status; reads only the file header + sidecars."""
    name = request.query.get("name", "")
    path = _resolve_lora_path(name)
    if not path:
        return web.json_response({"ok": False, "message": "LoRA not found."})
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, H.build_lora_info, path)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not read: {}".format(exc)})
    # The user's own words and picture ride along, so the panel gets everything in
    # one request. `preview_v` (the file mtime) busts the browser's hour-long
    # thumb cache when the picture was replaced elsewhere.
    try:
        info["custom_triggers"] = H.get_custom_triggers(_lora_custom_file(), name)
    except Exception:
        info["custom_triggers"] = []
    try:
        folder = _lora_previews_dir()
        info["preview_v"] = H.custom_preview_version(folder, name)
        info["custom_preview"] = bool(info["preview_v"])
        if info["custom_preview"]:
            info["has_preview"] = True
    except Exception:
        info["custom_preview"] = False
        info["preview_v"] = 0
    return web.json_response({"ok": True, "info": info}, headers={"Cache-Control": "no-store"})


@PromptServer.instance.routes.get("/zeonmkii/api/lora/thumb")
async def api_lora_thumb(request):
    """Serve the LoRA's preview image, or 404. The user's OWN picture wins over
    the one beside the LoRA."""
    name = request.query.get("name", "")
    path = _resolve_lora_path(name)
    if not path:
        return web.Response(status=404)
    try:
        own = H.find_custom_preview(_lora_previews_dir(), name)
        if own and not _lora_preview_path_checked(name):
            own = None
    except Exception:
        own = None
    if own:
        return web.FileResponse(own, headers={"Cache-Control": "public, max-age=3600"})
    prev = H.find_preview_path(path)
    roots = _lora_dirs()
    if not prev or not roots or not _is_path_under(prev, *roots):
        return web.Response(status=404)
    return web.FileResponse(prev, headers={"Cache-Control": "public, max-age=3600"})


# ── the OPTIONAL Civitai lookup (only on a user click) ─────────────────────

@PromptServer.instance.routes.get("/zeonmkii/api/lora/civitai")
async def api_lora_civitai(request):
    """Fingerprints the file (SHA256), asks Civitai for an exact-file match, and
    caches the raw response next to the LoRA so future reads are instant and
    offline. Always 200; `reason` tells the frontend which card to show:
    found / notfound / offline."""
    name = request.query.get("name", "")
    path = _resolve_lora_path(name)
    if not path:
        return web.json_response({"ok": False, "reason": "notfound", "message": "LoRA not found."})
    loop = asyncio.get_event_loop()
    try:
        sha = await loop.run_in_executor(None, H.file_sha256, path)
    except Exception as exc:
        return web.json_response({"ok": False, "reason": "offline",
                                  "message": "Could not read the file: {}".format(exc)})
    try:
        import aiohttp
    except Exception:
        return web.json_response({"ok": False, "reason": "offline",
                                  "message": "Could not reach Civitai."})
    timeout = aiohttp.ClientTimeout(total=30, connect=10)
    acc = _civitai_account()
    hosts = H.civitai_hosts(acc.get("host"))
    # The key stays in the Authorization header, NEVER in a query string: a
    # ?token= lands in proxy and server logs. No browser User-Agent either —
    # impersonating Chrome to slip past bot protection is not our style.
    headers = {
        "User-Agent": "ComfyUI-ZeonmkII-Nodes",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    }
    if acc.get("key"):
        headers["Authorization"] = "Bearer {}".format(acc["key"])
    data = None
    last_note = "Could not reach Civitai."
    key_note = None
    for i, host in enumerate(hosts):
        last = i == len(hosts) - 1
        url = "https://{}/api/v1/model-versions/by-hash/{}".format(host, sha)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 404:
                        # Only definitive on the LAST host: an adult-rated model is
                        # hidden behind this exact 404 on .com but served by .red.
                        if not last:
                            last_note = "Not found on {}.".format(host)
                            continue
                        return web.json_response({"ok": True, "found": False, "reason": "notfound"})
                    if resp.status in (401, 403):
                        # Host-specific failure — the backup host exists precisely
                        # for this. Never return early; keep the key note aside.
                        if acc.get("key"):
                            key_note = ("Civitai refused the API key ({}). Check it in the node "
                                        "settings.".format(resp.status))
                            last_note = key_note
                        else:
                            last_note = ("Civitai refused the request ({}). Your network may be "
                                         "blocking Civitai, or this model may need an API key - "
                                         "add one in the node settings.".format(resp.status))
                        continue
                    if resp.status != 200:
                        last_note = "Civitai returned {}.".format(resp.status)
                        continue
                    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
                    # Read the WHOLE body, in a loop, with a memory cap. A bare
                    # partial read truncates chunked replies and poisons json.loads.
                    chunks = []
                    total = 0
                    async for chunk in resp.content.iter_chunked(65536):
                        total += len(chunk)
                        if total > 4 * 1024 * 1024:
                            return web.json_response({"ok": False, "reason": "offline",
                                                      "message": "Civitai response too large."})
                        chunks.append(chunk)
                    body = b"".join(chunks)
                    try:
                        data = json.loads(body)
                    except Exception:
                        data = None
                        last_note = ("Civitai replied with {} instead of data - most likely a "
                                     "block or sign-in page from your network or its protection "
                                     "layer.".format(ctype or "an unknown format"))
                        continue
                    break
        except Exception as exc:
            kind = type(exc).__name__
            if "Timeout" in kind or "Cancelled" in kind:
                last_note = "Civitai timed out."
            elif "ContentEncoding" in kind or "Decompress" in kind:
                last_note = ("Civitai sent a compressed reply this install cannot read ({}). "
                             "Please report this.".format(kind))
            elif "JSON" in kind or "Decode" in kind or "Value" in kind:
                last_note = "Civitai sent an unreadable reply (a login or block page?)."
            else:
                last_note = "Could not reach Civitai ({}).".format(kind)
            continue
    if data is None:
        return web.json_response({"ok": False, "reason": "offline",
                                  "message": key_note or last_note})
    parsed = H.parse_civitai_modelversion(data, allow_adult=bool(acc.get("adult_thumbs")))
    if not parsed:
        return web.json_response({"ok": True, "found": False, "reason": "notfound"})
    await loop.run_in_executor(None, H.save_sidecar_cache, path, data)
    return web.json_response({"ok": True, "found": True, "info": parsed})


# ── user stores: custom trigger words, own preview picture ─────────────────

@PromptServer.instance.routes.post("/zeonmkii/api/lora/preview")
async def api_lora_preview_set(request):
    """Store the user's own preview picture for one LoRA. POST {name, dataUrl}.
    Size checked BEFORE decoding; bytes must LOOK like a picture."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):   # a truthy non-dict body would 500 the route
        body = {}
    name = str(body.get("name", "") or "")
    data_url = str(body.get("dataUrl", "") or "")
    path = _resolve_lora_path(name)
    roots = _lora_dirs()
    if not path or not roots or not _is_path_under(path, *roots):
        return web.json_response({"ok": False, "message": "LoRA not found."})
    if "," not in data_url:
        return web.json_response({"ok": False, "message": "Nothing to save."})
    payload = data_url.split(",", 1)[1]
    if len(payload) > _LORA_PREVIEW_MAX_BYTES * 4 // 3 + 8:
        return web.json_response({"ok": False, "message": "That picture is too large."})
    try:
        raw = base64.b64decode(payload)
    except Exception:
        return web.json_response({"ok": False, "message": "That picture could not be read."})
    if not raw or len(raw) > _LORA_PREVIEW_MAX_BYTES:
        return web.json_response({"ok": False, "message": "That picture is too large."})
    if not _looks_like_image(raw):
        return web.json_response(
            {"ok": False, "message": "That file is not a picture the browser can show."})
    if not _lora_preview_path_checked(name):
        return web.json_response({"ok": False, "message": "Bad preview path."})
    loop = asyncio.get_event_loop()
    folder = _lora_previews_dir()
    try:
        written = await loop.run_in_executor(None, H.write_custom_preview, folder, name, raw)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not save: {}".format(exc)})
    if not written:
        return web.json_response({"ok": False, "message": "Could not save that picture."})
    return web.json_response({"ok": True, "v": H.custom_preview_version(folder, name)})


@PromptServer.instance.routes.post("/zeonmkii/api/lora/preview_delete")
async def api_lora_preview_delete(request):
    """Remove the user's own preview so the automatic picture comes back. POST {name}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    name = str(body.get("name", "") or "") or request.query.get("name", "")
    path = _resolve_lora_path(name)
    roots = _lora_dirs()
    if not path or not roots or not _is_path_under(path, *roots):
        return web.json_response({"ok": False, "message": "LoRA not found."})
    if not _lora_preview_path_checked(name):
        return web.json_response({"ok": False, "message": "Bad preview path."})
    try:
        removed = H.delete_custom_preview(_lora_previews_dir(), name)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not remove: {}".format(exc)})
    return web.json_response({"ok": True, "removed": bool(removed)})


@PromptServer.instance.routes.post("/zeonmkii/api/lora/custom_triggers")
async def api_lora_custom_triggers(request):
    """Save the user's own trigger words for one LoRA. POST {name, words}.
    The name is a STORE KEY, never a filesystem path — but we still resolve it
    against the loras dirs so the store only gains entries for real LoRAs."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    name = data.get("name", "") or request.query.get("name", "")
    words = data.get("words", [])
    path = _resolve_lora_path(name)
    roots = _lora_dirs()
    if not path or not roots or not _is_path_under(path, *roots):
        return web.json_response({"ok": False, "message": "LoRA not found."})
    loop = asyncio.get_event_loop()
    try:
        stored = await loop.run_in_executor(None, H.set_custom_triggers, _lora_custom_file(), name, words)
    except Exception as exc:
        return web.json_response({"ok": False, "message": "Could not save: {}".format(exc)})
    return web.json_response({"ok": True, "words": stored})


@PromptServer.instance.routes.post("/zeonmkii/api/lora/civitai_delete")
async def api_lora_civitai_delete(request):
    """Delete the cached Civitai sidecar next to the LoRA, so the info reverts to
    the file's own words. POST {name}. Path-guarded; always 200."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    name = data.get("name", "") or request.query.get("name", "")
    path = _resolve_lora_path(name)
    roots = _lora_dirs()
    if not path or not roots or not _is_path_under(path, *roots):
        return web.json_response({"ok": False, "message": "LoRA not found."})
    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(None, H.delete_sidecar_cache, path)
    return web.json_response({"ok": bool(ok)})
