// ZeonmkII LoRAs Loader - the floating gear settings panel (Sizes / Sliders pattern:
// themed panel beside the node, draggable by its header, closes on outside click or
// Esc). Per-node preferences; "Set as default" stores them for new nodes.

import { app } from "../../../scripts/app.js";
import {
  readState, writeState, accentOf, saveDefaults, roundStrength, BRAND,
} from "./core.mjs";
import { getCivitaiAccount, setCivitaiAccount } from "./api.mjs";

let _panel = null;
let _panelNode = null;
let _refresh = null;
let _cpHandle = null;
let _followRaf = null;   // the canvas-follow loop, see startFollowing()
let _userMoved = false;  // the user dragged the panel, so stop following it

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function injectCSS() {
  if (document.getElementById("z-llp-css")) return;
  const s = document.createElement("style");
  s.id = "z-llp-css";
  s.textContent = `
    .z-llp { position:fixed; z-index:10010; width:290px; max-width:94vw; background:#1a1a1a;
      border:1px solid #4a4a4a; border-radius:10px; box-shadow:0 18px 50px rgba(0,0,0,0.6);
      color:#d8d8d8; font:12px 'Segoe UI',system-ui,sans-serif; overflow:hidden; }
    .z-llp-t { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#232323;
      border-bottom:1px solid #333; cursor:grab; user-select:none; color:var(--acc,${BRAND}); }
    .z-llp-t .x { margin-left:auto; color:#8a8a8a; cursor:pointer; padding:0 4px; }
    .z-llp-t .x:hover { color:#fff; }
    .z-llp-b { padding:12px; display:flex; flex-direction:column; gap:11px; max-height:64vh; overflow-y:auto; }
    .z-llp-row { display:flex; align-items:center; gap:10px; }
    .z-llp-row .lab { flex:1; color:#c2c2c2; }
    .z-llp-row .hint { display:block; font-size:10px; color:#7a7a7a; margin-top:1px; }
    .z-llp-num { width:66px; box-sizing:border-box; background:#161616; border:1px solid #4a4a4a;
      border-radius:6px; color:#fff; text-align:center; font:12px monospace; padding:6px 4px; outline:none; }
    .z-llp-num:focus { border-color:var(--acc,${BRAND}); }
    .z-llp-txt { width:70px; box-sizing:border-box; background:#161616; border:1px solid #4a4a4a;
      border-radius:6px; color:#fff; text-align:center; font:12px monospace; padding:6px 4px; outline:none; }
    .z-llp-txt:focus { border-color:var(--acc,${BRAND}); }
    .z-llp-sw { flex:0 0 auto; width:34px; height:18px; border-radius:99px; background:#3a3a3a;
      position:relative; cursor:pointer; border:1px solid #000; }
    .z-llp-sw::after { content:""; position:absolute; top:1px; left:1px; width:14px; height:14px;
      border-radius:50%; background:#8a8a8a; transition:left .14s, background .14s; }
    .z-llp-sw.on { background:var(--acc,${BRAND}); } .z-llp-sw.on::after { left:17px; background:#fff; }
    .z-llp-swatch { width:30px; height:22px; border-radius:5px; border:1px solid #555; cursor:pointer; flex:0 0 auto; }
    .z-llp-swatch:hover { border-color:#fff; }
    .z-llp-seg { flex:0 0 auto; display:flex; background:rgba(0,0,0,0.25); border:1px solid #444;
      border-radius:6px; overflow:hidden; }
    .z-llp-segb { padding:5px 9px; font:11px 'Segoe UI',sans-serif; color:#aaa; cursor:pointer;
      user-select:none; }
    .z-llp-segb:hover { color:#ddd; background:rgba(255,255,255,0.08); }
    .z-llp-segb.on { background:var(--acc,${BRAND}); color:#fff; }
    .z-llp-f { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #333; background:#1f1f1f; }
    .z-llp-btn { border:1px solid #444; background:rgba(255,255,255,0.04); color:#d8d8d8; border-radius:5px;
      padding:6px 12px; font:12px 'Segoe UI',sans-serif; cursor:pointer; }
    .z-llp-btn:hover { border-color:var(--acc,${BRAND}); color:#fff; }
    .z-llp-push { margin-left:auto; }
    /* The Civitai block. Everything above it is per-node; this is stored once on
       the machine, so it gets a rule and a heading that say so. */
    .z-llp-head { margin-top:2px; padding-top:11px; border-top:1px solid #333;
      color:var(--acc,${BRAND}); font-size:11px; letter-spacing:.04em; text-transform:uppercase; }
    .z-llp-head .sub { display:block; margin-top:3px; text-transform:none; letter-spacing:0;
      color:#7a7a7a; font-size:10px; line-height:1.4; }
    .z-llp-key { flex:1; min-width:0; box-sizing:border-box; background:#161616;
      border:1px solid #4a4a4a; border-radius:6px; color:#fff; font:12px monospace;
      padding:6px 8px; outline:none; }
    .z-llp-key:focus { border-color:var(--acc,${BRAND}); }
    .z-llp-mini { flex:0 0 auto; border:1px solid #444; background:rgba(255,255,255,0.04);
      color:#d8d8d8; border-radius:5px; padding:5px 9px; font:11px 'Segoe UI',sans-serif;
      cursor:pointer; user-select:none; }
    .z-llp-mini:hover { border-color:var(--acc,${BRAND}); color:#fff; }
    .z-llp-state { flex:1; font-size:11px; color:#7a7a7a; }
    .z-llp-state.set { color:#3ec371; }
    .z-llp-msg { font-size:10px; line-height:1.4; color:#c98a6a; }
  `;
  document.head.appendChild(s);
}

// Exported so the info panel places itself with the SAME geometry, including the
// Classic fallback below (the [data-node-id] element only exists in Nodes 2.0).
export function getNodeRect(node) {
  if (node?.id != null) {
    const e = document.querySelector(`[data-node-id="${node.id}"]`);
    if (e) return e.getBoundingClientRect();
  }
  const c = app.canvas, ds = c?.ds, cv = c?.canvas;
  if (!ds || !cv || !node?.pos || !node?.size) return null;
  const cr = cv.getBoundingClientRect();
  const titleH = window.LiteGraph?.NODE_TITLE_HEIGHT || 30;
  const sc = ds.scale || 1, off = ds.offset || [0, 0];
  const left = cr.left + (node.pos[0] + off[0]) * sc;
  const top = cr.top + (node.pos[1] - titleH + off[1]) * sc;
  return { left, top, right: left + node.size[0] * sc, bottom: top + (node.size[1] + titleH) * sc };
}
function placeBeside(panel, rect) {
  const vw = window.innerWidth, vh = window.innerHeight, mw = panel.offsetWidth, mh = panel.offsetHeight;
  const gap = 12, pad = 8;
  if (!rect) { panel.style.left = Math.max(pad, (vw - mw) / 2) + "px"; panel.style.top = Math.max(pad, (vh - mh) / 2) + "px"; return; }
  let left = rect.right + gap;
  if (left + mw > vw - pad) left = rect.left - gap - mw;
  if (left < pad) left = Math.max(pad, vw - mw - pad);
  let top = Math.min(rect.top, vh - mh - pad);
  panel.style.left = left + "px";
  panel.style.top = Math.max(pad, top) + "px";
}
/**
 * Keep the panel beside its node while the canvas moves.
 *
 * Without this the panel is written to a fixed screen position ONCE and stays
 * there, so zooming or panning strands it somewhere unrelated - and with two of
 * these nodes on the canvas there is then nothing to say which one it is editing.
 *
 * A rAF loop rather than an event, because LiteGraph emits nothing for a
 * transform change and a zoom has to be followed smoothly rather than caught up
 * with afterwards. It compares three numbers per frame and returns, so the idle
 * cost is nil, and it only runs while a panel is open.
 *
 * Stops the moment the user DRAGS the panel: from then on it is where they put
 * it on purpose, and moving it out from under them would be worse than letting
 * it sit still.
 */
function startFollowing(panel, node) {
  let lastScale = null, lastX = null, lastY = null;
  const tick = () => {
    if (!_panel || _panel !== panel || !panel.isConnected) { _followRaf = null; return; }
    _followRaf = requestAnimationFrame(tick);
    if (_userMoved) return;
    const ds = app.canvas?.ds;
    if (!ds) return;
    const sc = ds.scale || 1;
    const ox = ds.offset?.[0] ?? 0, oy = ds.offset?.[1] ?? 0;
    // Cheap numeric compare FIRST: this returns on almost every frame, so the
    // querySelector below only runs when the canvas genuinely moved.
    if (sc === lastScale && ox === lastX && oy === lastY) return;
    // Park while the colour picker is open, for the same reason as a user drag: the
    // picker anchors to the swatch ONCE and never re-anchors, so a panel sliding out
    // from under it would leave it floating over empty canvas, still open and no
    // longer attached to the thing it belongs to. A wheel is not a pointerdown, so
    // nothing would have closed either of them.
    //
    // Asks the DOM, NOT `_cpHandle`. The picker closes ITSELF on an outside click or
    // Escape and tells us nothing, so the handle stays truthy long after the picker
    // has gone - parking this loop for the rest of the panel's life. Reading the DOM
    // is self-healing, and it is the same selector the panel's own outside-close
    // guard already trusts.
    //
    // Deliberately does NOT update last* while parked, so the panel catches up on
    // the very next frame after the picker closes instead of staying stale until
    // something else happens to move.
    if (document.querySelector(".z-cp-popup, .z-cp-modal-backdrop")) return;
    lastScale = sc; lastX = ox; lastY = oy;
    placeBeside(panel, getNodeRect(node));
  };
  _followRaf = requestAnimationFrame(tick);
}

function stopFollowing() {
  if (_followRaf != null) cancelAnimationFrame(_followRaf);
  _followRaf = null;
}

function makeDraggable(panel, handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".x")) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;

    // BOTH defences against a drag that sticks to the cursor, because a pointerup
    // can genuinely go missing: released outside the window, on a second monitor,
    // or swallowed upstream. Synthetic events never reproduce it, so a green
    // scripted test proves nothing here - this is a house rule earned from a
    // human report on the Help window.
    try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }

    const move = (ev) => {
      if (!panel.isConnected) return up();
      // The button is no longer held: the release was lost, so end the drag.
      if (!(ev.buttons & 1)) return up();
      // From here the panel is where the USER put it, so stop following the node.
      _userMoved = true;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ev.clientX - ox)) + "px";
      panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ev.clientY - oy)) + "px";
    };
    // Idempotent: the buttons guard above can call this as well as a real
    // release, and lostpointercapture fires after we release it ourselves.
    let done = false;
    const up = () => {
      if (done) return;
      done = true;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      handle.removeEventListener("pointermove", move, true);
      handle.removeEventListener("pointerup", up, true);
      handle.removeEventListener("pointercancel", up, true);
      handle.removeEventListener("lostpointercapture", up, true);
    };
    handle.addEventListener("pointermove", move, true);
    handle.addEventListener("pointerup", up, true);
    handle.addEventListener("pointercancel", up, true);
    handle.addEventListener("lostpointercapture", up, true);
  });
}

function outsideClose(e) {
  if (!_panel) return;
  if (_panel.contains(e.target)) return;
  if (e.target.closest?.(".z-cp-popup, .z-cp-modal-backdrop")) return;
  closeLoraPanel();
}
function escClose(e) {
  if (e.key === "Escape" && _panel) {
    if (document.querySelector(".z-cp-popup, .z-cp-modal-backdrop")) return;
    e.stopPropagation();
    closeLoraPanel();
  }
}

export function closeLoraPanel() {
  try { _cpHandle?.close(); } catch {}
  _cpHandle = null;
  stopFollowing();
  // Reset here, not on open: a panel the user dragged must not teach the NEXT one
  // to sit still where the node is not.
  _userMoved = false;
  if (_panel) { try { _panel.remove(); } catch {} }
  _panel = null; _panelNode = null; _refresh = null;
  document.removeEventListener("pointerdown", outsideClose, true);
  document.removeEventListener("keydown", escClose, true);
}
export function closeLoraPanelFor(node) { if (_panelNode === node) closeLoraPanel(); }

export function openLoraPanel(node, refresh) {
  closeLoraPanel();
  injectCSS();
  _panelNode = node;
  _refresh = refresh || null;

  const panel = el("div", "z-llp");
  panel.style.setProperty("--acc", accentOf(node));

  const title = el("div", "z-llp-t");
  title.append(el("span", null, "⚙"), el("span", null, "LoRAs Loader settings"));
  const x = el("span", "x", "✕");
  x.addEventListener("click", closeLoraPanel);
  title.appendChild(x);

  const body = el("div", "z-llp-b");

  const fire = () => { _refresh?.(false); };
  const set = (patch) => { writeState(node, { ...readState(node), ...patch }); };

  // toggle row helper
  function toggleRow(label, hint, key, invert = false) {
    const row = el("div", "z-llp-row");
    const l = el("div", "lab"); l.append(el("span", null, label));
    if (hint) { const h = el("span", "hint", hint); l.appendChild(h); }
    const sw = el("div", "z-llp-sw");
    const cur = () => { const v = !!readState(node)[key]; return invert ? !v : v; };
    const paint = () => sw.classList.toggle("on", cur());
    paint();
    sw.addEventListener("click", () => {
      const next = !cur();
      set({ [key]: invert ? !next : next });
      paint();
      fire();
    });
    row.append(l, sw);
    return row;
  }

  // number row helper
  function numRow(label, key, { min = 0, round = null } = {}) {
    const row = el("div", "z-llp-row");
    row.appendChild(el("div", "lab", label));
    const inp = el("input", "z-llp-num");
    inp.type = "text";
    inp.value = String(readState(node)[key]);
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    inp.addEventListener("change", () => {
      let v = parseFloat(inp.value);
      if (!Number.isFinite(v)) v = readState(node)[key];
      if (round) v = round(v);
      if (v < min) v = min;
      set({ [key]: v });
      inp.value = String(readState(node)[key]);
      fire();
    });
    row.appendChild(inp);
    return row;
  }

  body.appendChild(numRow("Default strength (new LoRAs)", "defStrength", { min: -10, round: roundStrength }));
  body.appendChild(numRow("Strength step (arrows)", "step", { min: 0.001 }));
  body.appendChild(toggleRow("Separate model / clip strength",
    "Show two strengths per row", "linkStrength", true));

  // separator (text)
  const sepRow = el("div", "z-llp-row");
  sepRow.appendChild(el("div", "lab", "Trigger words separator"));
  const sepIn = el("input", "z-llp-txt");
  sepIn.type = "text";
  sepIn.value = readState(node).sep;
  sepIn.title = "Text placed between trigger words in the output (e.g. \", \")";
  sepIn.addEventListener("keydown", (e) => e.stopPropagation());
  sepIn.addEventListener("change", () => { set({ sep: sepIn.value }); fire(); });
  sepRow.appendChild(sepIn);
  body.appendChild(sepRow);

  // memory mode - a 3-way segmented pick (suite conventions #13: active = accent fill)
  function segRow(label, key, options) {
    const row = el("div", "z-llp-row");
    const l = el("div", "lab"); l.append(el("span", null, label));
    const hint = el("span", "hint", "");
    l.appendChild(hint);
    const wrap = el("div", "z-llp-seg");
    const paint = () => {
      const cur = readState(node)[key];
      for (const b of wrap.children) b.classList.toggle("on", b.dataset.v === cur);
      const o = options.find((x) => x.v === readState(node)[key]);
      hint.textContent = o ? o.hint : "";
    };
    for (const o of options) {
      const b = el("div", "z-llp-segb", o.label);
      b.dataset.v = o.v;
      b.title = o.title;
      b.addEventListener("click", () => { set({ [key]: o.v }); paint(); fire(); });
      wrap.appendChild(b);
    }
    paint();
    row.append(l, wrap);
    return row;
  }
  body.appendChild(segRow("LoRA memory use", "cacheMode", [
    { v: "last", label: "Standard", hint: "Keeps the last used LoRA in memory, like ComfyUI",
      title: "Balanced default: one LoRA stays loaded between runs" },
    { v: "all", label: "Fast", hint: "Keeps the whole stack in memory for quick re-runs",
      title: "Fastest re-runs; big stacks can hold gigabytes of RAM" },
    { v: "none", label: "Lowest", hint: "Re-reads the files on every run",
      title: "Smallest memory footprint, best for low-RAM machines" },
  ]));

  body.appendChild(toggleRow("Hide file extension",
    "Show the LoRA name without .safetensors", "hideExt"));
  body.appendChild(toggleRow("Civitai lookup button",
    "Show the optional online lookup in the info panel", "civitai"));
  body.appendChild(toggleRow("Show preview thumbnails",
    "In the info panel", "thumbs"));

  // ── Civitai account ────────────────────────────────────────────────────────
  //
  // Why this exists: Civitai hides adult-rated models from an anonymous API
  // request, answering the same plain 404 it uses for "no such file". From the
  // node those are indistinguishable, so a user whose LoRAs are adult-rated just
  // sees the lookup never work. A key from an account that is allowed to see that
  // content makes the identical request return the record.
  //
  // Unlike every other row in this panel these three are stored ONCE ON THIS
  // MACHINE, not on the node - a key on the node would be written into the
  // workflow file and travel to anyone it is shared with. The heading says so,
  // because "Set as default" in the footer sits a few pixels away and would
  // otherwise look like it covers them.
  //
  // The key is never sent back to the page: the server answers with whether one
  // is set plus its last four characters, which is enough to tell two keys apart
  // and useless in a screenshot.
  {
    const head = el("div", "z-llp-head", "Civitai account");
    head.appendChild(el("span", "sub",
      "Saved on this computer, never in your workflows. A key lets the lookup see "
      + "models that Civitai hides from anonymous requests."));
    body.appendChild(head);

    let acc = { configured: false, hint: "", host: "com", adultThumbs: false };

    const msg = el("div", "z-llp-msg");
    msg.style.display = "none";
    // `ok` picks the colour. Sitting directly under the key row, a success note in
    // the warning salmon read as a problem - and worse, the row immediately above
    // had just turned green, so two adjacent lines disagreed about whether the save
    // had worked. Green is the suite's success colour (convention #2).
    const say = (t, ok) => {
      msg.textContent = t || "";
      msg.style.display = t ? "block" : "none";
      msg.style.color = ok ? "#3ec371" : "";
    };

    // ── the key row, which swaps between showing and editing ──
    //
    // `editing` is the whole reason this row needs a state flag: paintKeyRow's
    // first act is to empty the row, so ANY repaint while the editor is open
    // destroys the box and the key that was pasted into it, with no message. Two
    // separate things reach that repaint - a click on the host or adult rows (they
    // save, succeed, and repaint everything) and the reply to the account GET fired
    // when the panel opened, which can land seconds later on a busy server. Both
    // are ordinary things to do while typing a key in.
    let editing = false;
    const keyRow = el("div", "z-llp-row");
    const paintKeyRow = () => {
      editing = false;
      keyRow.textContent = "";
      const state = el("div", "z-llp-state" + (acc.configured ? " set" : ""),
        acc.configured ? "✓ Key saved  " + acc.hint : "No key - anonymous lookups");
      const edit = el("div", "z-llp-mini", acc.configured ? "Change" : "Add key");
      edit.title = acc.configured
        ? "Replace the saved key with a different one"
        : "Paste a key from civitai.com > Account settings > API Keys";
      edit.addEventListener("click", showEditor);
      keyRow.append(state, edit);
      if (acc.configured) {
        const rm = el("div", "z-llp-mini", "Remove");
        rm.title = "Forget the key. Lookups go back to anonymous.";
        rm.addEventListener("click", () => save({ key: "" }, "Key removed."));
        keyRow.appendChild(rm);
      }
    };

    function showEditor() {
      editing = true;
      // Clear any previous note. Now that the message sits directly under this row,
      // "Key saved." left over from a moment ago would sit under a fresh EMPTY box
      // and read as the result of something the user has not done yet.
      say("");
      keyRow.textContent = "";
      const inp = el("input", "z-llp-key");
      // A password field, so it cannot be read over a shoulder or captured in the
      // screenshot people attach when they report that something did not work.
      inp.type = "password";
      inp.placeholder = "Paste your API key";
      inp.autocomplete = "off";
      inp.spellcheck = false;
      // Without this, typing in here reaches ComfyUI's global shortcuts - and
      // Delete there removes the selected node while you are mid-paste.
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(); }
      });
      const ok = el("div", "z-llp-mini", "Save");
      const no = el("div", "z-llp-mini", "Cancel");
      const commit = () => {
        const v = inp.value.trim();
        if (!v) { say("Nothing to save - paste a key first."); return; }
        // closeEditor: this is the ONE save that should replace the editor with the
        // status row, and only once the server has confirmed it.
        save({ key: v }, "Key saved.", { closeEditor: true });
      };
      ok.addEventListener("click", commit);
      no.addEventListener("click", () => { say(""); paintKeyRow(); });
      keyRow.append(inp, ok, no);
      inp.focus();
    }

    // ── which host to ask first ──
    const hostRow = el("div", "z-llp-row");
    const hostLab = el("div", "lab");
    hostLab.append(el("span", null, "Ask this site first"));
    const hostHint = el("span", "hint", "");
    hostLab.appendChild(hostHint);
    const hostSeg = el("div", "z-llp-seg");
    const HOSTS = [
      { v: "com", label: "Standard", hint: "civitai.com, then civitai.red as a backup",
        title: "The usual choice" },
      { v: "red", label: "Unrestricted", hint: "civitai.red first, for adult-rated models",
        title: "Civitai's unrestricted domain. Use this if your LoRAs are not found." },
    ];
    for (const o of HOSTS) {
      const b = el("div", "z-llp-segb", o.label);
      b.dataset.v = o.v;
      b.title = o.title;
      b.addEventListener("click", () => save({ host: o.v }, ""));
      hostSeg.appendChild(b);
    }
    hostRow.append(hostLab, hostSeg);

    // ── adult preview images ──
    const adultRow = el("div", "z-llp-row");
    const adultLab = el("div", "lab");
    adultLab.append(el("span", null, "Allow adult preview images"));
    adultLab.appendChild(el("span", "hint",
      "Off: a model whose pictures are all adult shows no thumbnail"));
    const adultSw = el("div", "z-llp-sw");
    adultSw.addEventListener("click", () => save({ adultThumbs: !acc.adultThumbs }, ""));
    adultRow.append(adultLab, adultSw);

    // Split from paint() on purpose - see the failure branch in save().
    const paintRest = () => {
      for (const b of hostSeg.children) b.classList.toggle("on", b.dataset.v === acc.host);
      const h = HOSTS.find((x) => x.v === acc.host);
      hostHint.textContent = h ? h.hint : "";
      adultSw.classList.toggle("on", !!acc.adultThumbs);
    };
    // Never rebuilds the key row while the editor is open - see `editing` above.
    const paint = () => { if (!editing) paintKeyRow(); paintRest(); };

    // Repaint from what the SERVER stored, never from what we hoped it took: a
    // refused key must not leave the panel claiming one is saved.
    async function save(patch, okNote, opts) {
      const res = await setCivitaiAccount(patch);
      if (!res || !res.ok) {
        say((res && res.message) || "Could not save.");
        // Deliberately NOT a full repaint. paintKeyRow() rebuilds the row from
        // scratch, which throws away the editor and everything typed into it - so
        // a refused key used to clear the box and close the editor, leaving the
        // user to find and re-paste the key to try again while an error sat
        // underneath. The error is the one moment the text matters most.
        paintRest();
        return;
      }
      acc = res;
      if (opts?.closeEditor) editing = false;
      say(okNote, true);
      paint();
    }

    // msg goes directly under the KEY row, not at the end: every message it carries
    // is about the key, and appended last it rendered two unrelated rows below the
    // box that caused it (and could fall below the panel's scroll fold). It is
    // display:none until say() writes something, so it costs no layout when idle.
    body.append(keyRow, msg, hostRow, adultRow);
    paint();
    getCivitaiAccount().then((res) => {
      if (!res || !res.ok) { say("Could not read the Civitai settings."); return; }
      // The panel can be closed and reopened before this lands; writing into a
      // detached DOM would be harmless but pointless, and repainting a panel the
      // user has replaced would fight the newer one.
      if (!keyRow.isConnected) return;
      acc = res;
      paint();
    });
  }


  // footer
  const foot = el("div", "z-llp-f");
  const mkDefault = el("button", "z-llp-btn", "Set as default");
  mkDefault.title = "Use these settings for every new LoRA Loader node";
  mkDefault.addEventListener("click", async () => {
    const st = readState(node);
    const ok = await saveDefaults(st);
    mkDefault.textContent = ok ? "Saved as default" : "Could not save";
    setTimeout(() => { mkDefault.textContent = "Set as default"; }, 1200);
  });
  const done = el("button", "z-llp-btn z-llp-push", "Done");
  done.addEventListener("click", closeLoraPanel);

  foot.append(mkDefault, done);

  panel.append(title, body, foot);
  document.body.appendChild(panel);
  placeBeside(panel, getNodeRect(node));
  makeDraggable(panel, title);

  setTimeout(() => {
    if (!_panel) return;
    document.addEventListener("pointerdown", outsideClose, true);
    document.addEventListener("keydown", escClose, true);
  }, 0);
  _panel = panel;
  // After _panel is assigned: the loop's first act is to check it owns the panel.
  startFollowing(panel, node);
}
