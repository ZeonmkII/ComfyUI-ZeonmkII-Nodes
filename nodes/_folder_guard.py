"""
ZeonmkII Save Image — folder guard.

Slim port of Pixaroma's path-containment model (nodes/_path_guard.py +
server_routes.py, MIT): saving anywhere under ComfyUI's own roots is always
fine; any OTHER folder must first be approved by a human at the keyboard via
the native OS dialog — the one signal a request can't fake. The approval
lives in a small JSON in ComfyUI's user directory.
"""

import ipaddress
import json
import os

import folder_paths

_CONFIG_LOCK = __import__("threading").Lock()


def _config_path():
    return os.path.join(folder_paths.get_user_directory(), "zeonmkii-approved-folders.json")


def comfy_roots():
    roots = []
    for getter in ("get_output_directory", "get_input_directory", "get_temp_directory"):
        try:
            roots.append(os.path.realpath(getattr(folder_paths, getter)()))
        except Exception:
            pass
    return roots


def _read_config():
    try:
        with open(_config_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("folders"), list):
            return {"allow_any": bool(data.get("allow_any")), "folders": [str(x) for x in data["folders"]]}
    except Exception:
        pass
    return {"allow_any": False, "folders": []}


def _write_config(cfg):
    tmp = _config_path() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=1)
    os.replace(tmp, _config_path())


def unc_like(raw):
    """Windows UNC share (lexical only — never touch the filesystem for it)."""
    s = str(raw or "")
    return s.startswith("\\\\") or s.startswith("//")


def is_path_under(path, *roots):
    try:
        real = os.path.realpath(str(path))
        for root in roots:
            r = os.path.realpath(str(root))
            if os.path.commonpath([r, real]) == r:
                return True
    except (OSError, ValueError, TypeError):
        pass
    return False


def _lexically_under_any(raw, folders):
    s = os.path.normpath(str(raw)).rstrip("\\/").lower()
    for folder in folders:
        f = os.path.normpath(str(folder)).rstrip("\\/").lower()
        if s == f or s.startswith(f + os.sep) or s.startswith(f + "\\") or s.startswith(f + "/"):
            return True
    return False


def prescreen(raw):
    """Cheap NO-FILESYSTEM screen on an untrusted folder string BEFORE any
    realpath/isdir (Pixaroma lesson: resolving \\\\attacker\\share leaks NTLM)."""
    if unc_like(raw):
        return _lexically_under_any(raw, _read_config()["folders"])
    return True


def folder_allowed(path):
    """True when this pack may write to `path`."""
    if not path or not isinstance(path, str):
        return False
    if unc_like(path):
        return _lexically_under_any(path, _read_config()["folders"])
    roots = comfy_roots()
    if roots and is_path_under(path, *roots):
        return True
    folders = _read_config()["folders"]
    return bool(folders) and is_path_under(path, *folders)


def remember_folder(path):
    """Add a folder the user picked IN THE NATIVE OS DIALOG to the allowlist.
    Native-dialog-only, per Pixaroma's trust model."""
    if not path or not isinstance(path, str) or unc_like(path):
        return False
    try:
        real = os.path.realpath(path)
    except (OSError, ValueError, TypeError):
        return False
    if not os.path.isdir(real):
        return False
    with _CONFIG_LOCK:
        cfg = _read_config()
        if real not in cfg["folders"]:
            cfg["folders"].append(real)
            try:
                _write_config(cfg)
            except Exception:
                return False
    return True


def peer_is_local(request):
    """True when the HTTP peer is this machine (a native dialog only makes
    sense on the screen the browser is on)."""
    try:
        peer = getattr(request, "remote", None)
        if not peer:
            return False
        return ipaddress.ip_address(str(peer).strip("[]")).is_loopback
    except (ValueError, TypeError, AttributeError):
        return False


def resolve_save_path(path):
    """Image Saver's containment, plus the one Pixaroma extra: an APPROVED
    folder may be absolute. Anything unapproved/relative falls back to
    resolve_within_output (the vendored Image Saver rule)."""
    p = str(path or "").strip()
    if os.path.isabs(p) and prescreen(p) and folder_allowed(p) and os.path.isdir(p):
        return p
    from .saver_lib.utils import resolve_within_output
    return resolve_within_output(p)
