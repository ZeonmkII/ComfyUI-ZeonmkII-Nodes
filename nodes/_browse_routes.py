"""
ZeonmkII Save Image — native folder browse routes.

Slim port of Pixaroma's load_images_folder pick_native machinery
(server_routes.py, MIT): the Browse button opens the OS folder dialog on the
ComfyUI host. Trust model kept verbatim in spirit:
  • loopback callers only — a dialog on someone else's screen is useless
  • the START path must already be approved (else a crafted link could pop
    the dialog on an attacker's share and one OK click would allowlist it)
  • the ONLY place a folder gets remembered is the route that received the
    path back from the OS dialog — never from a request body
"""

import asyncio
import os

from aiohttp import web

from server import PromptServer

from ._folder_guard import peer_is_local, prescreen, folder_allowed, remember_folder

_DIALOG_LOCK = __import__("threading").Lock()


def _dialog_available():
    import shutil
    import sys
    if sys.platform == "win32":
        return shutil.which("powershell") is not None
    if sys.platform == "darwin":
        return shutil.which("osascript") is not None
    return shutil.which("zenity") is not None or shutil.which("kdialog") is not None


def _dialog_windows(start_path):
    import subprocess
    # Invisible TopMost owner form, dialog opens in its Shown event so it
    # inherits the foreground (Pixaroma's "opens behind the browser" fix).
    # Start path rides an env var — no quoting hazards.
    ps = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "$r='';"
        "$o=New-Object System.Windows.Forms.Form;"
        "$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.FormBorderStyle='None';"
        "$o.Width=1;$o.Height=1;$o.Opacity=0;$o.StartPosition='CenterScreen';"
        "$o.Add_Shown({"
        "$o.Activate();"
        "$d=New-Object System.Windows.Forms.FolderBrowserDialog;"
        "$d.Description='Choose a save folder';$d.ShowNewFolderButton=$true;"
        "if($env:ZEON_START){try{$d.SelectedPath=$env:ZEON_START}catch{}};"
        "if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){$script:r=$d.SelectedPath};"
        "$o.Close()"
        "});"
        "[void]$o.ShowDialog();"
        "[Console]::Out.Write($r)"
    )
    env = dict(os.environ)
    env["ZEON_START"] = start_path or ""
    out = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", ps],
        capture_output=True, text=True, timeout=300, env=env,
        creationflags=0x08000000,  # CREATE_NO_WINDOW
    )
    return (out.stdout or "").strip()


def _dialog_macos(start_path):
    import re
    import subprocess
    script = 'POSIX path of (choose folder with prompt "Choose a save folder")'
    if start_path and os.path.isdir(start_path) and re.match(r'^[^"\\\x00-\x1f]+$', start_path):
        script = (
            'POSIX path of (choose folder with prompt "Choose a save folder" '
            f'default location POSIX file "{start_path}")'
        )
    try:
        out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300)
        return (out.stdout or "").strip().rstrip("/") if out.returncode == 0 else ""
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def _dialog_linux(start_path):
    import shutil
    import subprocess
    start = start_path if (start_path and os.path.isdir(start_path)) else os.path.expanduser("~")
    if shutil.which("zenity"):
        try:
            out = subprocess.run(
                ["zenity", "--file-selection", "--directory",
                 "--title=Choose a save folder", f"--filename={start}/"],
                capture_output=True, text=True, timeout=300,
            )
            return (out.stdout or "").strip() if out.returncode == 0 else ""
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    if shutil.which("kdialog"):
        try:
            out = subprocess.run(
                ["kdialog", "--getexistingdirectory", start, "--title", "Choose a save folder"],
                capture_output=True, text=True, timeout=300,
            )
            return (out.stdout or "").strip() if out.returncode == 0 else ""
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    return ""


def _native_dialog(start_path=""):
    """Open the OS folder picker. Chosen path, "" (cancelled) or None (busy).
    One dialog at a time, via the lock; runs in a thread (executor)."""
    if not _DIALOG_LOCK.acquire(blocking=False):
        return None
    try:
        import sys
        if sys.platform == "win32":
            return _dialog_windows(start_path)
        if sys.platform == "darwin":
            return _dialog_macos(start_path)
        return _dialog_linux(start_path)
    except Exception as e:
        print(f"[ZeonmkII] native folder dialog failed: {e}")
        return ""
    finally:
        try:
            _DIALOG_LOCK.release()
        except Exception:
            pass


@PromptServer.instance.routes.get("/zeonmkii/api/save_image/pick_folder")
async def api_zeon_pick_folder(request):
    """Pop the native OS folder dialog on the ComfyUI host.
    {ok:true,path,remembered} on pick; {ok:false,cancelled} on cancel;
    {ok:false,unavailable} when no dialog tool exists or caller is remote."""
    if not peer_is_local(request):
        return web.json_response({"ok": False, "unavailable": True})
    if not _dialog_available():
        return web.json_response({"ok": False, "unavailable": True})
    start = request.query.get("path", "")
    # THE START PATH MUST ALREADY BE APPROVED (Pixaroma round-3 lesson):
    # FolderBrowserDialog returns SelectedPath when OK is clicked without
    # navigating, so an unapproved start would be click-to-allowlist.
    if not (prescreen(start) and folder_allowed(start)):
        start = ""
    loop = asyncio.get_running_loop()
    path = await loop.run_in_executor(None, _native_dialog, start)
    if path is None:
        return web.json_response({"ok": False, "busy": True})
    if path and os.path.isdir(path):
        remembered = remember_folder(path)  # THE approval point — dialog only
        return web.json_response({"ok": True, "path": path, "remembered": bool(remembered)})
    return web.json_response({"ok": False, "cancelled": True})
