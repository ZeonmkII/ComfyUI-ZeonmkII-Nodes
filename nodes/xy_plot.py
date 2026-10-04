"""ZeonmkII XY Plot — run the workflow over every X x Y value combination and
assemble the results into a labeled comparison grid.

Port of Pixaroma's XY Plot (node_xy_plot.py, MIT), rebranded to the ZeonmkII
pack: Zeon crimson grid accents, Inter font bundle (assets/fonts, with its
license), /zeonmkii/api/xy_plot/* save routes (nodes/_xy_routes.py), and the
`zeonmkii_xy_grid` ui key. The sweep engine itself is unchanged.

How it works (the heavy lifting is shared with the frontend driver in
js/xy_plot/index.js):
  - The frontend patches app.queuePrompt to loop ONE workflow run per (x, y)
    cell. Before each run it injects that cell's X and Y values into the
    TARGET nodes' widgets via app.graphToPrompt, and injects this node's
    per-cell cursor + the full label arrays into the hidden XYPlotState input.
  - Each run, this node receives the cell image + the cursor. It accumulates
    the cell server-side keyed by a per-plot `sessionId`, (re)assembles the
    labeled grid PNG with PIL, hands the PNG filename to the frontend (custom
    ui key `zeonmkii_xy_grid`) for the in-node <img> preview, and outputs the
    assembled grid tensor on the `grid` IMAGE slot. The grid is valid after
    every cell (missing/errored cells stay blank) and complete after the last.
  - A normal Run (no plot cursor) just passes the image straight through.

The accumulator + cell PILs are also reachable by the save routes
(nodes/_xy_routes.py) so the Save buttons can write the grid (and optionally
each individual cell) to disk/output.
"""
import json
import os
import threading

import folder_paths
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

# Guards the module-level session state below. The node executes on ComfyUI's
# worker thread while the save / restyle routes run on the aiohttp thread, so a
# theme-restyle or save during a live plot can otherwise read `cells` mid-write.
_LOCK = threading.RLock()

# Hard cap on grid dimensions so a malformed/oversized state can't allocate a
# giant canvas before the long-side downscale kicks in. Mirrors the JS cap.
_MAX_DIM = 100

# ── Server-side accumulator ────────────────────────────────────────────────
# Keyed by sessionId -> {
#   "cells": {(xi, yi): PIL.Image RGB},   # the rendered cells received so far
#   "cols": int, "rows": int,
#   "x_labels": [str...], "y_labels": [str...],
#   "x_name": str, "y_name": str, "draw_labels": bool,
#   "grid_name": str,   # stable temp filename for this plot's grid PNG
#   "prefix": str,      # filename_prefix for the Save buttons
# }
_SESSIONS = {}
_SESSION_ORDER = []      # LRU order of sessionIds
_MAX_SESSIONS = 8        # cap stored plots so memory can't grow unbounded

# Grid layout constants (px). Labels + gaps scale with cell size at render time.
_GRID_LONG_SIDE_CAP = 4096   # preview + IMAGE-output long-side cap (keeps them light)

# Save-resolution presets for the Save Disk / Save Output buttons (px on the
# grid's long side). The Save buttons re-assemble the grid at SAVE time from the
# cached cells, so a bigger export costs nothing on a normal run. "full" is native
# resolution, but hard-capped on the long side so a pathological huge plot
# exports a bounded PNG instead of a ~100000px monster.
_GRID_FULL_SAFETY = 16384
_SAVE_SIZE_CAPS = {"2048": 2048, "4096": 4096, "8192": 8192, "full": _GRID_FULL_SAFETY}

# Grid color themes. The cells are the user's images (unchanged); these colors
# style the background, the empty-cell tiles, the value labels, and the axis-name
# lines. "dark" is the default; the axis accent is the ZeonmkII crimson.
_THEMES = {
    "dark":  {"grid": (20, 20, 20),    "cell": (42, 42, 42),    "label": (235, 235, 235), "axis": (162, 0, 0)},
    "light": {"grid": (242, 242, 242), "cell": (255, 255, 255), "label": (28, 28, 28),   "axis": (162, 0, 0)},
    "mono":  {"grid": (18, 18, 18),    "cell": (40, 40, 40),    "label": (236, 236, 236), "axis": (170, 170, 170)},
}

_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")
_FONT_CACHE = {}


def _load_font(size):
    """Load the bundled Inter for label text, with graceful fallbacks.
    Variable fonts load at their default instance. Cached by size."""
    size = max(8, int(size))
    if size in _FONT_CACHE:
        return _FONT_CACHE[size]
    font = None
    try:
        p = os.path.join(_FONT_DIR, "Inter-Variable.ttf")
        if os.path.exists(p):
            font = ImageFont.truetype(p, size)
        if font is None and os.path.isdir(_FONT_DIR):
            for f in sorted(os.listdir(_FONT_DIR)):
                if f.lower().endswith((".ttf", ".otf")):
                    font = ImageFont.truetype(os.path.join(_FONT_DIR, f), size)
                    break
    except Exception:
        font = None
    if font is None:
        try:
            font = ImageFont.load_default(size)   # PIL >= 10
        except Exception:
            font = ImageFont.load_default()
    _FONT_CACHE[size] = font
    return font


def _fit_font(draw, text, base_size, max_w, min_size=10):
    """Return a font sized so `text` fits within `max_w` px - shrinking from
    `base_size` down to `min_size` rather than truncating, so axis labels stay
    fully readable (sampler / checkpoint names can be long)."""
    f = _load_font(base_size)
    w = _measure(draw, text, f)[0]
    if w <= max_w or w <= 0:
        return f
    return _load_font(max(min_size, int(base_size * max_w / w)))


# ── label wrapping ──────────────────────────────────────────────────────────
# A value on an axis can be a whole PROMPT, not just a sampler name. Shrinking
# such a label to one line bottoms out at the min font size and then simply
# overflows its strip. These wrap it into the strip instead.

def _line_h(draw, font):
    """Line pitch for `font`: ascender-to-descender plus a little leading."""
    return max(1, _measure(draw, "Ayg", font)[1] + 3)


def _hard_break(draw, word, font, max_w):
    """Split one over-wide word (a URL, a run_of_underscores) into chunks that
    fit. Without this a single long token would overflow no matter the wrap."""
    out, cur = [], ""
    for ch in word:
        trial = cur + ch
        if cur and _measure(draw, trial, font)[0] > max_w:
            out.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        out.append(cur)
    return out or [word]


def _ellipsize(draw, text, font, max_w):
    t = text
    while t and _measure(draw, t + "…", font)[0] > max_w:
        t = t[:-1]
    return (t + "…") if t else "…"


def _wrap_ex(draw, text, font, max_w, max_lines=None):
    """`_wrap_lines`, plus whether a WORD had to be split mid-way.

    The flag lets _fit_wrapped prefer a slightly smaller font over a word cut in
    half: on a narrow strip a word only a pixel or two too wide gets guillotined,
    which reads as a rendering fault rather than as wrapping."""
    if max_w <= 0:
        return [str(text)], False
    words = str(text).split()
    if not words:
        return [""], False
    lines, cur, broke = [], "", False
    for w in words:
        trial = (cur + " " + w) if cur else w
        if _measure(draw, trial, font)[0] <= max_w:
            cur = trial
            continue
        if cur:
            lines.append(cur)
            cur = ""
        if _measure(draw, w, font)[0] <= max_w:
            cur = w
        else:
            pieces = _hard_break(draw, w, font, max_w)
            broke = True
            lines.extend(pieces[:-1])
            cur = pieces[-1]
    if cur:
        lines.append(cur)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _ellipsize(draw, lines[-1], font, max_w)
    return lines, broke


def _wrap_lines(draw, text, font, max_w, max_lines=None):
    """Greedy word wrap of `text` into lines that each fit `max_w`.

    Returns at least one line. When `max_lines` is given the last kept line is
    ellipsized, so a clipped label never reads as if it were complete."""
    return _wrap_ex(draw, text, font, max_w, max_lines)[0]


# _assemble_grid runs once PER CELL and re-lays-out every label each time, which
# is cubic in the grid side. The memo makes the layout cost O(1) across cells.
# `draw` is deliberately NOT part of the key - _measure was verified
# byte-identical across RGB / RGBA / L draw contexts at four different canvas
# sizes, so the layout depends only on the text, the font size and the box.
# Callers must treat the returned list as read-only.
_WRAP_MEMO = {}
_WRAP_MEMO_MAX = 512


def _fit_wrapped(draw, text, base_size, max_w, max_h, min_size=9):
    """Wrap `text` into (font, lines, line_height) fitting `max_w` x `max_h`.

    Shrinks the font a step at a time until the wrapped block fits the box;
    only if it still does not at `min_size` does it clip (with the ellipsis)
    rather than spill over the neighbouring image."""
    key = (str(text), int(base_size), int(max_w), int(max_h), int(min_size))
    hit = _WRAP_MEMO.get(key)
    if hit is not None:
        # Hand back a COPY of the line list. The memo outlives the assemble, so
        # one future `lines.insert(...)` in a caller would silently corrupt every
        # later cell, theme restyle and Save export of that plot.
        return (hit[0], list(hit[1]), hit[2])

    size = int(base_size)
    out = None
    first_fit = None      # largest size that fits by HEIGHT, even if it split a word
    while size >= min_size:
        f = _load_font(size)
        lh = _line_h(draw, f)
        lines, broke = _wrap_ex(draw, text, f, max_w)
        if len(lines) * lh <= max_h:
            if not broke:
                out = (f, lines, lh)      # fits AND keeps every word whole
                break
            if first_fit is None:
                first_fit = (f, lines, lh)
        size -= 1
    # A word wider than the strip at EVERY size can never be kept whole, so fall
    # back to the largest size that fitted rather than shrinking for nothing.
    if out is None:
        out = first_fit
    if out is None:
        f = _load_font(min_size)
        lh = _line_h(draw, f)
        keep = max(1, int(max_h // lh))
        out = (f, _wrap_lines(draw, text, f, max_w, max_lines=keep), lh)

    if len(_WRAP_MEMO) >= _WRAP_MEMO_MAX:
        _WRAP_MEMO.clear()   # bounded reset; the next assemble re-derives cheaply
    _WRAP_MEMO[key] = out
    return (out[0], list(out[1]), out[2])


# A prompt on the X axis would otherwise make the header strip taller than the
# pictures; 3 lines is enough to recognise which value a column is.
_X_LABEL_MAX_LINES = 3


def _tensor_to_pil(frame):
    """HxWxC float [0,1] tensor -> RGB PIL.Image."""
    arr = (frame.detach().cpu().contiguous().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    pil = Image.fromarray(arr)
    if pil.mode != "RGB":
        pil = pil.convert("RGB")
    return pil


def _pil_to_tensor(pil):
    """RGB PIL.Image -> 1xHxWx3 float [0,1] tensor."""
    if pil.mode != "RGB":
        pil = pil.convert("RGB")
    arr = np.array(pil, dtype=np.float32) / 255.0
    return torch.from_numpy(arr)[None, ...]


def _measure(draw, text, font):
    try:
        l, t, r, b = draw.textbbox((0, 0), text, font=font)
        return (r - l, b - t)
    except Exception:
        try:
            return draw.textsize(text, font=font)
        except Exception:
            return (len(text) * 7, 12)


def _evict_sessions():
    while len(_SESSION_ORDER) > _MAX_SESSIONS:
        old = _SESSION_ORDER.pop(0)
        sess = _SESSIONS.pop(old, None)
        # Delete the evicted plot's grid PNG from temp/ so old grids don't pile up.
        if sess and sess.get("grid_name"):
            try:
                p = os.path.join(folder_paths.get_temp_directory(), sess["grid_name"])
                if os.path.isfile(p):
                    os.remove(p)
            except Exception:
                pass


def _touch_session(session_id):
    if session_id in _SESSION_ORDER:
        _SESSION_ORDER.remove(session_id)
    _SESSION_ORDER.append(session_id)
    _evict_sessions()


def get_session(session_id):
    """Used by the save routes (nodes/_xy_routes.py)."""
    with _LOCK:
        return _SESSIONS.get(session_id)


def snapshot_session_cells(session_id):
    """Return a list of ((xi, yi), PIL.Image) for a session, copied under the
    lock so the save route can iterate without racing execute()'s writes."""
    with _LOCK:
        sess = _SESSIONS.get(session_id)
        if not sess or not isinstance(sess.get("cells"), dict):
            return ([], "")
        return (list(sess["cells"].items()), str(sess.get("grid_name") or ""))


def restyle_session(session_id, theme):
    """Re-render an existing plot's grid with a new color theme WITHOUT
    re-running the workflow (the cells are still cached). Returns the grid's
    temp filename, or None if the session has been evicted."""
    with _LOCK:
        sess = _SESSIONS.get(session_id)
        if not sess:
            return None
        sess["theme"] = theme if theme in _THEMES else "dark"
        grid_pil = _assemble_grid(sess)   # reads cells; under lock so execute can't mutate mid-read
        grid_name = sess["grid_name"]
        # Re-embed the workflow execute() put in this file, so switching theme
        # doesn't silently strip the plot's metadata.
        grid_info = sess.get("pnginfo")
    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    try:
        grid_pil.save(os.path.join(temp_dir, grid_name), "PNG",
                      pnginfo=grid_info)   # I/O outside the lock
    except Exception:
        return None
    return grid_name


def _assemble_grid(sess, max_long_side=_GRID_LONG_SIDE_CAP):
    """Build the labeled grid PIL.Image from whatever cells `sess` has so far.
    Missing cells render as empty tiles. Pure function of the session state.

    max_long_side caps the grid's long side (default 4096 for the preview + the
    IMAGE tensor). Pass None/0 to skip the cap and assemble at native resolution
    (used by the Save buttons for full-resolution exports)."""
    cells = sess["cells"]
    cols = max(1, int(sess["cols"]))
    rows = max(1, int(sess["rows"]))
    draw_labels = bool(sess.get("draw_labels", True))
    pal = _THEMES.get(sess.get("theme") or "dark", _THEMES["dark"])

    # Cell size = the first received cell's size (assume a uniform batch).
    sample = next(iter(cells.values()), None)
    if sample is not None:
        cell_w, cell_h = sample.size
    else:
        cell_w = cell_h = 256

    gap = max(4, round(min(cell_w, cell_h) * 0.02))
    font_size = max(13, min(48, round(cell_h * 0.07)))
    pad = max(4, round(font_size * 0.4))

    # Measure label strips with a scratch draw context.
    scratch = Image.new("RGB", (4, 4))
    sdraw = ImageDraw.Draw(scratch)
    font = _load_font(font_size)

    x_labels = sess.get("x_labels") or [""] * cols
    y_labels = sess.get("y_labels") or [""] * rows
    x_name = sess.get("x_name") or ""
    y_name = sess.get("y_name") or ""

    x_label_lines = []
    x_lh = _line_h(sdraw, font)
    if draw_labels:
        # Row-label strip: wide enough to show the full Y label. A label too
        # long for the cap is WRAPPED into the strip when drawn.
        row_w_cap = max(160, round(cell_w * 0.5))
        widest = 0
        for lab in y_labels:
            widest = max(widest, _measure(sdraw, str(lab), font)[0])
        for nm in (("↓ " + y_name), ("→ " + x_name)):
            widest = max(widest, _measure(sdraw, nm, _load_font(max(11, round(font_size * 0.8))))[0])
        row_label_w = max(60, min(row_w_cap, widest + 2 * pad))

        # Column labels wrap too, so the header strip has to be as tall as the
        # tallest wrapped label. They SHRINK to fit that budget rather than being
        # hard-clipped (clipping made two nearly-identical prompts render
        # byte-identical headers - no way to tell the columns apart).
        x_budget_h = _X_LABEL_MAX_LINES * x_lh
        for ci in range(cols):
            lab = str(x_labels[ci]) if ci < len(x_labels) else ""
            if not lab:
                x_label_lines.append(None)
                continue
            x_label_lines.append(_fit_wrapped(sdraw, lab, font_size, cell_w - 6, x_budget_h))
        blocks = [len(e[1]) * e[2] for e in x_label_lines if e]
        col_label_h = (max(blocks) if blocks else x_lh) + 2 * pad
    else:
        col_label_h = 0
        row_label_w = 0

    grid_w = row_label_w + cols * cell_w + (cols + 1) * gap
    grid_h = col_label_h + rows * cell_h + (rows + 1) * gap

    img = Image.new("RGB", (grid_w, grid_h), pal["grid"])
    draw = ImageDraw.Draw(img)

    def cell_xy(ci, ri):
        x = row_label_w + gap + ci * (cell_w + gap)
        y = col_label_h + gap + ri * (cell_h + gap)
        return x, y

    # Cells (or empty tiles).
    for ri in range(rows):
        for ci in range(cols):
            x, y = cell_xy(ci, ri)
            cell = cells.get((ci, ri))
            if cell is not None:
                if cell.size != (cell_w, cell_h):
                    tile = Image.new("RGB", (cell_w, cell_h), pal["cell"])
                    fitted = cell.copy()
                    fitted.thumbnail((cell_w, cell_h), Image.LANCZOS)
                    tile.paste(fitted, ((cell_w - fitted.width) // 2,
                                        (cell_h - fitted.height) // 2))
                    img.paste(tile, (x, y))
                else:
                    img.paste(cell, (x, y))
            else:
                draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], fill=pal["cell"])

    if draw_labels:
        # Column labels (X values), wrapped and centered above each column.
        for ci in range(cols):
            entry = x_label_lines[ci] if ci < len(x_label_lines) else None
            if not entry:
                continue
            lf, lines, lh = entry
            cx, _ = cell_xy(ci, 0)
            ty = (col_label_h - len(lines) * lh) / 2
            for line in lines:
                tw = _measure(draw, line, lf)[0]
                draw.text((cx + (cell_w - tw) / 2, ty), line, font=lf, fill=pal["label"])
                ty += lh
        # Row labels (Y values), wrapped into the left strip and centered.
        y_avail_w = max(1, row_label_w - 2 * pad)
        for ri in range(rows):
            lab = str(y_labels[ri]) if ri < len(y_labels) else ""
            if not lab:
                continue
            lf, lines, lh = _fit_wrapped(draw, lab, font_size, y_avail_w, cell_h - 4)
            _, cy = cell_xy(0, ri)
            ty = cy + (cell_h - len(lines) * lh) / 2
            for line in lines:
                tw = _measure(draw, line, lf)[0]
                draw.text((pad + max(0, (y_avail_w - tw) / 2), ty), line, font=lf, fill=pal["label"])
                ty += lh
        # Axis names in the top-left corner: "↓ y_name" over "→ x_name".
        corner_lines = []
        if y_name:
            corner_lines.append("↓ " + y_name)
        if x_name:
            corner_lines.append("→ " + x_name)
        ty = 3
        corner_w = max(40, row_label_w - 6)
        for line in corner_lines:
            lf = _fit_font(draw, line, max(11, round(font_size * 0.8)), corner_w)
            draw.text((4, ty), line, font=lf, fill=pal["axis"])
            ty += _measure(draw, line, lf)[1] + 2

    # Cap the long side so a big grid can't explode memory / the preview.
    long_side = max(grid_w, grid_h)
    if max_long_side and long_side > max_long_side:
        scale = max_long_side / long_side
        img = img.resize((max(1, round(grid_w * scale)), max(1, round(grid_h * scale))), Image.LANCZOS)

    return img


def resolve_save_cap(value):
    """Map a Save-resolution choice ('2048'|'4096'|'8192'|'full') to a long-side
    px cap for the Save buttons. Unknown/None -> the default preview cap (4096),
    so an old client or a bad value saves exactly as before."""
    return _SAVE_SIZE_CAPS.get(str(value or "").lower(), _GRID_LONG_SIDE_CAP)


def render_session_full(session_id, max_long_side=None):
    """Re-assemble an existing plot's grid at a chosen resolution WITHOUT
    re-running the workflow. Returns the PIL.Image, or None if the session has
    been evicted. Assembly runs under the lock; the returned image is a fresh,
    independent buffer, so the caller encodes/saves it OUTSIDE the lock."""
    with _LOCK:
        sess = _SESSIONS.get(session_id)
        if not sess:
            return None
        return _assemble_grid(sess, max_long_side=max_long_side)


# ── metadata helpers (self-contained; the pack has no shared _save_helpers) ──

def _json_safe(obj):
    """Recursively convert a prompt/workflow structure to JSON-safe types."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items()}
    return str(obj)


def _build_pnginfo(prompt=None, extra_pnginfo=None, workflow=None):
    """Build a PngInfo carrying the workflow (+ prompt) so the grid PNG can be
    dragged back into the graph, mirroring what Preview Image embeds."""
    from PIL.PngImagePlugin import PngInfo
    if extra_pnginfo and isinstance(extra_pnginfo, dict) and extra_pnginfo.get("workflow") is not None:
        workflow = extra_pnginfo.get("workflow")
    info = PngInfo()
    if workflow is not None:
        info.add_text("workflow", json.dumps(_json_safe(workflow)))
    if prompt is not None:
        info.add_text("prompt", json.dumps(_json_safe(prompt)))
    return info


class ZeonmkIIXYPlot:
    DESCRIPTION = (
        "XY Plot ZeonmkII - compare settings at a glance. Drop this node at the "
        "end of your workflow and wire your final image into it, just like a "
        "Preview node. In the node body, pick what changes ACROSS (X) and DOWN "
        "(Y) from a dropdown of the nodes already in your graph - no extra "
        "wiring. The value box adapts to what you pick: a number gives a "
        "Start/End/Steps range, a dropdown (sampler, model) gives a checklist, "
        "and a prompt gives find-and-replace. Hit Run once: the workflow runs "
        "for every combination and the results fill a labeled grid right here in "
        "the node, with Save Disk / Save Output / Copy / Open buttons. The seed "
        "is locked across cells (unless you're plotting the seed) so the only "
        "difference you see is the thing you're testing."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Wire your workflow's final image here, like a Preview node. Each plot run feeds one cell of the grid."}),
                "filename_prefix": ("STRING", {"default": "xy_plot", "tooltip": "Filename stem used by the Save buttons. Supports subfolders with '/'."}),
            },
            "hidden": {
                "XYPlotState": ("STRING", {"default": "{}"}),
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("grid",)
    OUTPUT_TOOLTIPS = ("The assembled comparison grid. During a plot it's the grid built so far; after the last cell it's complete. Wire it onward (e.g. to upscale or save) if you like.",)
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "ZeonmkII"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always re-execute: every cell is a distinct run with a different
        # cursor + (usually) a different upstream image. NaN guarantees no
        # cache hit ever returns a stale cell. Same pattern as Preview.
        return float("nan")

    def execute(self, image, filename_prefix="xy_plot", XYPlotState="{}", prompt=None, extra_pnginfo=None):
        try:
            state = json.loads(XYPlotState) if XYPlotState else {}
            if not isinstance(state, dict):
                state = {}
        except (ValueError, TypeError):
            state = {}

        session_id = state.get("sessionId")
        # No plot cursor -> this is a normal single Run. Pass the image through.
        if not session_id:
            return {"ui": {}, "result": (image,)}

        try:
            xi = int(state.get("xi", 0))
            yi = int(state.get("yi", 0))
            cols = max(1, min(_MAX_DIM, int(state.get("cols", 1))))
            rows = max(1, min(_MAX_DIM, int(state.get("rows", 1))))
        except (ValueError, TypeError) as e:
            print("[ZeonmkII] XY Plot: malformed cursor in XYPlotState: %s" % e)
            return {"ui": {}, "result": (image,)}

        # Accumulate + (re)assemble under the lock so a concurrent restyle/save
        # on the aiohttp thread can't read `cells` mid-write.
        with _LOCK:
            # Create the session on its FIRST cell. A fresh sessionId per plot
            # means a genuinely new plot always lands here; we do NOT wipe an
            # existing session when a (0,0) cell re-arrives (retry/re-execute),
            # which would discard the cells gathered so far.
            if session_id not in _SESSIONS:
                grid_name = "zeonmkii_xy_grid_%s.png" % "".join(
                    c for c in str(session_id) if c.isalnum() or c in "_-"
                )[:80]
                _SESSIONS[session_id] = {
                    "cells": {},
                    "cols": cols, "rows": rows,
                    "x_labels": state.get("xLabels") or [],
                    "y_labels": state.get("yLabels") or [],
                    "x_name": state.get("xName") or "",
                    "y_name": state.get("yName") or "",
                    "draw_labels": bool(state.get("drawLabels", True)),
                    "theme": state.get("theme") or "dark",
                    "grid_name": grid_name,
                    "prefix": state.get("prefix") or filename_prefix,
                }
            sess = _SESSIONS[session_id]
            _touch_session(session_id)

            # Keep label arrays / dims fresh (JS sends the full arrays every cell).
            sess["cols"], sess["rows"] = cols, rows
            if isinstance(state.get("xLabels"), list):
                sess["x_labels"] = [str(v) for v in state["xLabels"][:cols]]
            if isinstance(state.get("yLabels"), list):
                sess["y_labels"] = [str(v) for v in state["yLabels"][:rows]]
            sess["x_name"] = state.get("xName") or sess.get("x_name", "")
            sess["y_name"] = state.get("yName") or sess.get("y_name", "")
            sess["draw_labels"] = bool(state.get("drawLabels", sess.get("draw_labels", True)))
            sess["theme"] = state.get("theme") or sess.get("theme", "dark")

            # Store this cell (first frame of the batch). Skip out-of-range cells
            # so a bad cursor can't accumulate cells that never render / leak.
            if 0 <= xi < cols and 0 <= yi < rows:
                try:
                    sess["cells"][(xi, yi)] = _tensor_to_pil(image[0])
                except Exception as e:
                    print("[ZeonmkII] XY Plot: failed to store cell (%d,%d): %s" % (xi, yi, e))
            else:
                print("[ZeonmkII] XY Plot: cell (%d,%d) outside %dx%d grid - skipped" % (xi, yi, cols, rows))

            grid_name = sess["grid_name"]
            try:
                grid_pil = _assemble_grid(sess)
            except Exception as e:
                # A malformed session must never crash the whole workflow run.
                print("[ZeonmkII] XY Plot: grid assembly failed: %s" % e)
                grid_pil = None

        if grid_pil is None:
            return {"ui": {}, "result": (image,)}

        # Write the grid PNG to temp/ for the preview (I/O outside the lock).
        # The workflow/prompt go INTO the file so Open-in-a-new-tab, right-click
        # Save image and drag-off-the-node all hand back a reloadable plot.
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        try:
            grid_info = _build_pnginfo(prompt=prompt, extra_pnginfo=extra_pnginfo)
        except Exception as e:
            # Metadata is a nice-to-have; it must never cost the user their plot.
            print("[ZeonmkII] XY Plot: grid metadata skipped: %s" % e)
            grid_info = None
        # Stash it so a THEME RESTYLE re-embeds instead of silently stripping it.
        with _LOCK:
            sess_now = _SESSIONS.get(session_id)
            if sess_now is not None:
                sess_now["pnginfo"] = grid_info
        try:
            grid_pil.save(os.path.join(temp_dir, grid_name), "PNG", pnginfo=grid_info)
        except Exception as e:
            print("[ZeonmkII] XY Plot: failed to write grid PNG: %s" % e)

        # Hand the EXECUTION-time prompt + workflow to the frontend (embedded as
        # an extra field on the frame, NOT a separate ui key) so Save Output
        # bakes in the seed that actually produced the grid.
        workflow = extra_pnginfo.get("workflow") if isinstance(extra_pnginfo, dict) else None
        frame = {
            "filename": grid_name,
            "subfolder": "",
            "type": "temp",
            "_xy": _json_safe({"sessionId": str(session_id), "xi": xi, "yi": yi,
                               "cols": cols, "rows": rows}),
            "_zeonmkii_meta": _json_safe({"prompt": prompt, "workflow": workflow}),
        }
        return {
            "ui": {"zeonmkii_xy_grid": [frame]},
            "result": (_pil_to_tensor(grid_pil),),
        }


NODE_CLASS_MAPPINGS = {"ZeonmkIIXYPlot": ZeonmkIIXYPlot}
NODE_DISPLAY_NAME_MAPPINGS = {"ZeonmkIIXYPlot": "XY Plot ZeonmkII"}
