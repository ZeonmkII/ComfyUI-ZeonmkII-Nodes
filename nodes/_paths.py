"""
ZeonmkII — shared user-typed path resolution (Boss 18:48 ask).

The path placeholders read 'ComfyUI/input/', so relative paths must
actually WORK everywhere, not just where the server happens to launch:
  • absolute paths → untouched
  • relative paths → first existing match wins, in order:
      1. the launch CWD (classic behaviour — portable launches resolve
         'ComfyUI/input' here)
      2. the ComfyUI root (folder_paths.base_path — 'input' works on any
         install)
      3. the ComfyUI root's parent ('ComfyUI/input' works even when the
         server was launched from somewhere else entirely)
  • nothing exists → the CWD join is returned, so error messages still
    name a sane path

Nodes AND their stats/reset routes resolve through this ONE helper —
never two versions of the truth about where a path points.
"""

import os

try:
    import folder_paths
    _BASE = folder_paths.base_path
except Exception:  # outside ComfyUI (local unit checks)
    _BASE = None


def resolve_path(raw):
    p = os.path.expanduser(str(raw or "").strip())
    if not p or os.path.isabs(p):
        return p
    cands = [os.path.join(os.getcwd(), p)]
    if _BASE:
        cands.append(os.path.join(_BASE, p))
        cands.append(os.path.join(os.path.dirname(os.path.realpath(_BASE)), p))
    seen = set()
    for c in cands:
        if c in seen:
            continue
        seen.add(c)
        if os.path.exists(c):
            return os.path.realpath(c)
    return cands[0]
