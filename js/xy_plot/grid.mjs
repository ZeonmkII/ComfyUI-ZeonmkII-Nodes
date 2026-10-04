// XY Plot ZeonmkII - in-node grid preview (an <img> showing Python's latest
// assembled grid PNG) + the Save Disk / Save Output / Copy / Open button row.
//
// Python owns all grid rendering, so this is just display + save plumbing.
// An <img> is resolution-independent, so it stays crisp at any zoom in both
// renderers (the Nodes 2.0 canvas-blur rule doesn't apply to <img>).

import { app } from "../../../scripts/app.js";
import { zeonApiUrl } from "../shared/api_url.mjs";
import { readState } from "./core.mjs";

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function toast(summary, detail, severity = "info") {
  const tm = app.extensionManager?.toast;
  if (tm && typeof tm.add === "function") {
    try { tm.add({ severity, summary, detail, life: 3500 }); return; } catch (_e) {}
  }
  try {
    const b = el("div", null, `${summary}: ${detail}`);
    b.style.cssText = "position:fixed;top:60px;right:20px;background:#1d1d1d;color:#fff;font:13px sans-serif;padding:10px 14px;border-radius:6px;border:2px solid var(--zeon-acc,#A20000);z-index:99999;";
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 3500);
  } catch (_e) {}
}

function prefixOf(node) {
  const w = node.widgets?.find((x) => x && x.name === "filename_prefix");
  const v = (w && typeof w.value === "string") ? w.value.trim() : "";
  return v || "xy_plot";
}

async function fetchGridBlob(node) {
  const last = node._zeonXyLastGrid;
  if (!last || !last.url) return null;
  try {
    const resp = await fetch(last.url, { cache: "no-store" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    // Force image/png so ClipboardItem (strict) accepts it.
    return blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
  } catch (_e) { return null; }
}

async function doCopy(node) {
  const blob = await fetchGridBlob(node);
  if (!blob) { toast("XY Plot", "No grid to copy yet.", "warn"); return; }
  if (!navigator.clipboard || !window.ClipboardItem) {
    toast("XY Plot", "Clipboard image copy isn't supported in this browser.", "warn"); return;
  }
  try {
    await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    toast("XY Plot", "Grid copied to clipboard.");
  } catch (_e) { toast("XY Plot", "Copy failed.", "error"); }
}

function doOpen(node) {
  const last = node._zeonXyLastGrid;
  if (!last || !last.url) { toast("XY Plot", "No grid to open yet.", "warn"); return; }
  // Use an <a target="_blank"> click rather than window.open(...,"noopener"):
  // Chrome returns null from window.open when "noopener" is set even on
  // success, which made the old code falsely report "popup blocked".
  const a = el("a");
  a.href = last.url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Ask the server to re-assemble the grid at the chosen Save resolution and
// return the PNG bytes (with the run's workflow embedded), for Save Disk. Returns
// a Blob, or null when there's no live session (caller falls back to the capped
// preview file). The size is built on demand, so it costs nothing until you Save.
async function fetchFullResBlob(node) {
  const last = node._zeonXyLastGrid;
  if (!last || !last.sessionId) return null;
  const state = readState(node);
  // Prefer the EXECUTION-time prompt/workflow (locked seed) - same as Save Output.
  let prompt = node._zeonXyExecPrompt || null;
  let workflow = node._zeonXyExecWorkflow || null;
  if (!workflow && !prompt) {
    try { const gp = await app.graphToPrompt(); prompt = gp?.output || null; workflow = gp?.workflow || null; } catch (_e) {}
  }
  try {
    const resp = await fetch(zeonApiUrl("/zeonmkii/api/xy_plot/render_full"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: last.sessionId,
        save_max_size: state.saveMaxSize || "4096",
        prompt, workflow,
      }),
    });
    if (!resp.ok) return null;   // 404 = session evicted -> caller uses the preview
    const blob = await resp.blob();
    return blob && blob.size ? blob : null;
  } catch (_e) { return null; }
}

async function doSaveDisk(node) {
  const last = node._zeonXyLastGrid;
  if (!last || !last.url) { toast("XY Plot", "No grid to save yet.", "warn"); return; }
  const name = prefixOf(node).split("/").pop() + "_grid.png";

  if (window.showSaveFilePicker) {
    // Open the picker FIRST, while the user-gesture activation is still valid - a
    // slow full-res encode could otherwise outlast it and the picker would throw.
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
      });
    } catch (e) {
      if (e && e.name === "AbortError") return;   // user cancelled the dialog
      toast("XY Plot", "Save to disk failed.", "error"); return;
    }
    let blob = await fetchFullResBlob(node);
    let capped = false;
    if (!blob) { blob = await fetchGridBlob(node); capped = true; }   // session expired
    if (!blob) { toast("XY Plot", "No grid to save.", "error"); return; }
    try {
      const ws = await handle.createWritable();
      await ws.write(blob); await ws.close();
      toast("XY Plot", capped
        ? "Grid saved to disk (preview size - re-run the plot for full resolution)."
        : "Grid saved to disk.", capped ? "warn" : "info");
    } catch (_e) {
      toast("XY Plot", "Save to disk failed.", "error");
    }
    return;
  }

  // Fallback (no File System Access API): fetch then anchor-download.
  let blob = await fetchFullResBlob(node);
  let capped = false;
  if (!blob) { blob = await fetchGridBlob(node); capped = true; }
  if (!blob) { toast("XY Plot", "No grid to save yet.", "warn"); return; }
  try {
    const url = URL.createObjectURL(blob);
    const a = el("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
    toast("XY Plot", capped
      ? "Saved at preview size (session expired - re-run for full resolution)."
      : "Grid saved to disk.", capped ? "warn" : "info");
  } catch (_e) {
    toast("XY Plot", "Save to disk failed.", "error");
  }
}

async function doSaveOutput(node) {
  const last = node._zeonXyLastGrid;
  if (!last || !last.filename) { toast("XY Plot", "No grid to save yet.", "warn"); return; }
  const state = readState(node);
  // Prefer the EXECUTION-time prompt/workflow captured when the grid ran, so
  // the embedded metadata reproduces the grid's actual (locked) seed. Fall back
  // to the live graph only if no run happened this session (Preview Pattern #13).
  let prompt = node._zeonXyExecPrompt || null;
  let workflow = node._zeonXyExecWorkflow || null;
  if (!workflow && !prompt) {
    try {
      const gp = await app.graphToPrompt();
      prompt = gp?.output || null;
      workflow = gp?.workflow || null;
    } catch (_e) {}
  }
  const wantCells = state.saveCells === true;
  try {
    const resp = await fetch(zeonApiUrl("/zeonmkii/api/xy_plot/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grid_filename: last.filename,
        session_id: last.sessionId || null,
        filename_prefix: prefixOf(node),
        save_cells: wantCells,
        save_max_size: state.saveMaxSize || "4096",
        prompt, workflow,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) { toast("XY Plot", data.error || "Save to output failed.", "error"); return; }
    const extra = data.saved_cells ? ` (+${data.saved_cells} cells)` : "";
    const dims = (data.width && data.height) ? ` - ${data.width}×${data.height}` : "";
    toast("XY Plot", `Saved to output/${data.subfolder ? data.subfolder + "/" : ""}${data.filename}${extra}${dims}`);
    // If cells were requested but none were written (session expired), say so.
    if (wantCells && !data.saved_cells) {
      toast("XY Plot", "Grid saved, but cells couldn't be saved (session expired) - re-run the plot to save cells.", "warn");
    }
  } catch (_e) {
    toast("XY Plot", "Save to output failed.", "error");
  }
}

// Build the preview + button row into `mount` (the .z-xy-gridmount element).
// Returns an API object cached on the node by index.js.
export function buildGridPreview(node, mount) {
  mount.innerHTML = "";
  const box = el("div", "z-xy-gridbox");
  const hint = el("div", "z-xy-gridhint", "The labeled grid appears here after you hit Run.");
  const img = el("img", "z-xy-gridimg");
  img.style.display = "none";
  // On load, only RE-FIT the node when the grid's pixel dimensions actually
  // changed (a new plot shape). A theme re-skin is the exact same size, so
  // re-fitting there just made fitNode and ComfyUI's own layout fight over a
  // few px forever (the flicker). Always repaint, twice, so the frame settles.
  img.addEventListener("load", () => {
    const dims = (img.naturalWidth || 0) + "x" + (img.naturalHeight || 0);
    if (dims !== node._zeonXyGridDims) {
      node._zeonXyGridDims = dims;
      try { node._zeonXyFit?.(); } catch (_e) {}
    }
    try { node.setDirtyCanvas?.(true, true); } catch (_e) {}
    requestAnimationFrame(() => { try { node.setDirtyCanvas?.(true, true); } catch (_e) {} });
  });
  box.appendChild(hint);
  box.appendChild(img);
  mount.appendChild(box);

  // ── Preview size follows the node ─────────────────────────────────────────
  // The <img> is width-constrained (max-width:100%), so its height follows its
  // aspect ratio - until a FLAT max-height cap stops it. With the old constant
  // 360px, a square or tall grid hit the cap almost immediately and then never
  // grew again however wide the node was dragged: measured 532x360 at a
  // 900-wide node AND at a 1300-wide node. That is the "preview freezes"
  // report.
  //
  // The cap now scales with the box's WIDTH, so widening the node genuinely
  // enlarges the preview and narrowing it shrinks it back. Keying off WIDTH is
  // what makes this safe: the image only ever influences the node's HEIGHT
  // (through measureContentHeight -> getMinHeight), so there is no feedback
  // loop - and the observer early-returns unless the width actually changed,
  // which is the second guard. Nothing here calls setSize, so it cannot fight
  // Align's resize guard mid-drag either.
  // CAP_MAX is NOT optional. The image's height feeds measureContentHeight ->
  // getMinHeight -> the node's minimum, so an uncapped ratio makes a TALL grid
  // produce a node that cannot be dragged shorter. The sharp case is a common
  // one: a single Y axis with 10 values is a 1-col x 10-row grid, which at a
  // 900-wide node measured a 227px-wide SLIVER 1722px tall inside a node whose
  // computeSize minimum was 2402. A preview taller than ~1100 is unreadable in
  // the node anyway - that is what Open and Save Disk are for.
  // Do NOT key the ceiling off window.innerHeight: the window is not observed
  // here, so it would go stale on a window resize.
  const CAP_FLOOR = 360;    // degenerate/zero-width layout guard (MIN_W 420 means
                            // w*RATIO normally dominates; this is not the old constant)
  const CAP_RATIO = 2;      // up to a 1:2 tall preview before capping
  // 900 rather than something looser: it leaves the shapes a 2D plot actually
  // produces (square and wider) completely UNCAPPED at ordinary node widths -
  // a 3x3 grid on a 900-wide node measures 861 tall, a 3x2 on a 1300-wide node
  // 853 - so the "widening the node enlarges the preview" behaviour this whole
  // change is about is untouched, while the single-column pathological case is
  // bounded at a node you can still work with. It is also still 2.5x the flat
  // 360 that caused the report, so nobody will read 900 as "frozen small".
  const CAP_MAX = 900;
  let lastCapW = -1;
  const applyCap = () => {
    if (!img.isConnected) return;
    const w = box.clientWidth;
    if (w <= 0 || w === lastCapW) return;
    lastCapW = w;
    const cap = Math.min(Math.max(CAP_FLOOR, w * CAP_RATIO), CAP_MAX);
    img.style.maxHeight = Math.round(cap) + "px";
  };
  applyCap();
  let capRO = null;
  try {
    capRO = new ResizeObserver(applyCap);
    capRO.observe(box);
  } catch (_e) {}
  // This function opens with mount.innerHTML = "", which advertises it as safe
  // to re-call; honour that by releasing any previous observer rather than
  // orphaning it in the single-slot handle.
  try { node._zeonXyCapRO?.disconnect(); } catch (_e) {}
  node._zeonXyCapRO = capRO;

  const bar = el("div", "z-xy-savebar");
  const mk = (label, fn) => { const b = el("div", "z-xy-sb", label); b.addEventListener("click", () => fn(node)); return b; };
  const bSave = mk("Save Disk", doSaveDisk);
  const bOut = mk("Save Output", doSaveOutput);
  const bCopy = mk("Copy", doCopy);
  const bOpen = mk("Open", doOpen);
  bar.appendChild(bSave); bar.appendChild(bOut); bar.appendChild(bCopy); bar.appendChild(bOpen);
  mount.appendChild(bar);

  const setEnabled = (on) => {
    [bSave, bOut, bCopy, bOpen].forEach((b) => b.classList.toggle("disabled", !on));
  };
  setEnabled(false);

  let gridReq = 0;   // bumped per setGrid so a stale preload can't swap a stale grid

  return {
    setGrid(url) {
      // Preload the new grid, then swap the VISIBLE img only once it's ready.
      // This keeps the old grid (same size) on screen during a theme re-skin so
      // the <img> never collapses -> the node doesn't shrink-then-grow -> no
      // flicker and the bottom buttons never poke out of the frame.
      // A request token guards against two rapid setGrid calls (e.g. theme
      // spam): only the LATEST preload is allowed to swap, and only if the
      // node/img is still alive.
      const token = (gridReq += 1);
      const show = () => {
        if (token !== gridReq) return;          // a newer setGrid superseded this
        if (!img.isConnected) return;            // node/img torn down meanwhile
        img.src = url;
        img.style.display = "block";
        hint.style.display = "none";
        setEnabled(true);
      };
      const pre = new Image();
      pre.onload = show;
      pre.onerror = show;   // show anyway; the visible img will surface the error
      pre.src = url;
    },
    clear() {
      img.removeAttribute("src");
      img.style.display = "none";
      hint.style.display = "";
      setEnabled(false);
      node._zeonXyGridDims = null;   // so the next grid re-fits the node
    },
  };
}
