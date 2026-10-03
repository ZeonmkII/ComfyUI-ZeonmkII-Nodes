// ZeonmkII LoRAs Loader - the info panel (click a row's i). Shows the LoRA's info +
// trigger words read straight from the file, lets the user tick which words feed
// the triggers output, and offers the OPTIONAL Civitai lookup with its four states
// (searching / found / not found / offline). Selections persist on the row.

import { app } from "../../../scripts/app.js";
import { readState, patchLora, accentOf, BRAND } from "./core.mjs";
import { loraInfo, thumbUrl, civitaiLookup, invalidateInfo, deleteCivitai, saveCustomTriggers,
         saveLoraPreview, deleteLoraPreview } from "./api.mjs";
import { getNodeRect } from "./settings.mjs";

let _panel = null;
let _cleanup = null;
let _ownerNode = null;
let _followRaf = null;   // keeps the panel beside its node, see startFollowing()
let _userMoved = false;  // the user dragged it, so stop following

/**
 * Tick a LoRA's own trigger words, once, the first time we learn them.
 *
 * Asked for 2026-08-11: *"the ticked trigger words get cleared after each run...
 * it'd be better if the trigger words were just automatically ticked (and
 * automatically used). Otherwise, adding the LoRA is pointless for those that
 * require a trigger word."* Free when the `triggers` output is not wired, which
 * is the normal case.
 *
 * ONLY the authoritative words: Civitai's trainedWords when we have them, else
 * the author's DECLARED trigger phrase (`explicit_triggers`). Deliberately NOT
 * `file_triggers`, which appends the twenty most frequent training tags after
 * the phrase - ticking those would quietly paste twenty booru tags into the
 * prompt, which is not what anyone means by "the trigger word".
 *
 * `at` on the row makes this happen once per LoRA rather than once per open, so
 * un-ticking a word STICKS instead of reappearing on the next visit. patchLora
 * clears it when the row's LoRA changes, so the new file gets the same offer.
 */
export function autoTickFromInfo(node, id, info, refresh) {
  if (!node || !info) return;
  const e = readState(node).loras.find((x) => x.id === id);
  if (!e || e.at) return;                        // already offered for this LoRA
  const words = (info.sidecar_triggers?.length ? info.sidecar_triggers
    : (info.explicit_triggers || [])).filter((w) => String(w || "").trim());
  // Mark it offered even when there are none, or a LoRA that simply has no
  // declared words would be re-checked on every open for a set that will never
  // appear - and the write itself would dirty the workflow each time.
  if (!words.length) { patchLora(node, id, { at: true }); return; }
  const have = new Set((e.triggers || []).map((w) => w.toLowerCase()));
  const next = [...(e.triggers || [])];
  for (const w of words) {
    if (have.has(w.toLowerCase())) continue;
    have.add(w.toLowerCase());
    next.push(w);
  }
  patchLora(node, id, { triggers: next, at: true });
  refresh?.(false);
}

/**
 * The same thing for a row whose LoRA was just PICKED, without the info panel
 * ever being opened - which is the common way to add a LoRA, and where the
 * request actually bites.
 *
 * RE-QUERIES the row after the await instead of trusting what was captured
 * before it: the user can pick a different LoRA, delete the row, or delete the
 * node while a (usually instant, but not on a network share) metadata read is
 * out. A guard has to be right about identity; a re-query cannot be wrong.
 */
export async function autoTickAfterPick(node, id, name, refresh) {
  if (!node || !name) return;
  let j;
  try { j = await loraInfo(name); } catch { return; }
  if (!j?.ok || !j.info) return;
  const e = readState(node).loras.find((x) => x.id === id);
  if (!e || e.name !== name) return;             // row is gone, or points elsewhere now
  autoTickFromInfo(node, id, j.info, refresh);
}

function injectCSS() {
  if (document.getElementById("z-ll-info-css")) return;
  const s = document.createElement("style");
  s.id = "z-ll-info-css";
  s.textContent = `
    .z-ll-info-p { position:fixed; z-index:10025; width:340px; max-width:94vw; background:#1b1b1b;
      border:1px solid ${BRAND}; border-radius:10px; box-shadow:0 14px 44px rgba(0,0,0,0.6);
      overflow:hidden; font:12px 'Segoe UI',system-ui,sans-serif; color:#ddd; }
    .z-ll-info-top { display:flex; gap:11px; padding:12px; border-bottom:1px solid #131313; cursor:grab; }
    .z-ll-info-th { width:64px; height:64px; border-radius:7px; flex:none; border:1px solid #000;
      background:radial-gradient(circle at 60% 35%,#4a3a5b,#221a2e 72%); background-size:cover; background-position:center;
      position:relative; overflow:hidden; cursor:pointer; }
    /* The hover label doubles as the drop target's feedback and the saving state,
       so there is only ever one thing painted over the picture. */
    .z-ll-info-th::after { content:attr(data-hint); position:absolute; inset:0; display:flex;
      align-items:center; justify-content:center; text-align:center; padding:2px;
      background:rgba(0,0,0,0.58); color:#fff; font:9.5px 'Segoe UI',system-ui,sans-serif;
      opacity:0; transition:opacity .12s; pointer-events:none; }
    .z-ll-info-th:hover::after, .z-ll-info-th.drop::after, .z-ll-info-th.busy::after { opacity:1; }
    .z-ll-info-th.drop { border-color:var(--acc,${BRAND}); box-shadow:inset 0 0 0 2px var(--acc,${BRAND}); }
    .z-ll-thx { position:absolute; top:2px; right:2px; width:15px; height:15px; z-index:2;
      border-radius:50%; background:rgba(0,0,0,0.7); color:#ddd;
      font:10px/15px 'Segoe UI',system-ui,sans-serif; text-align:center; opacity:0; transition:opacity .12s; }
    .z-ll-info-th:hover .z-ll-thx { opacity:1; }
    .z-ll-thx:hover { background:#ff2b3a; color:#fff; }
    .z-ll-info-h { min-width:0; flex:1; }
    .z-ll-info-h h3 { margin:0 0 4px; font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .z-ll-info-meta { font:10px monospace; color:#7a7a7a; line-height:1.7; }
    .z-ll-civlink { display:inline-block; margin-top:5px; font:10.5px 'Segoe UI'; color:#8fc0ff;
      cursor:pointer; }
    .z-ll-civlink:hover { color:#b8d8ff; text-decoration:underline; }
    .z-ll-info-x { margin-left:auto; color:#8a8a8a; cursor:pointer; align-self:flex-start; }
    .z-ll-info-x:hover { color:#fff; }
    .z-ll-info-sec { padding:11px 12px; }
    .z-ll-info-sec h4 { margin:0 0 6px; font:600 9.5px 'Segoe UI'; text-transform:uppercase; letter-spacing:.7px;
      color:${BRAND}; display:flex; align-items:center; gap:7px; }
    .z-ll-info-sec h4 .src { margin-left:auto; font:9px 'Segoe UI'; text-transform:none; letter-spacing:0;
      color:#8a8a8a; border:1px solid #2a2a2a; border-radius:99px; padding:1px 7px; }
    .z-ll-info-sec h4 .src.net { color:#8fc0ff; border-color:#3a5a80; }
    .z-ll-info-sec h4 .qa { margin-left:8px; font:9.5px 'Segoe UI'; text-transform:none; letter-spacing:0;
      color:#9a9a9a; cursor:pointer; }
    .z-ll-info-sec h4 .qa:hover { color:${BRAND}; }
    .z-ll-info-note { font-size:10px; color:#7a7a7a; margin:0 0 8px; }
    .z-ll-chips { display:flex; flex-wrap:wrap; gap:5px; max-height:36vh; overflow-y:auto; padding-right:2px; }
    .z-ll-chips::-webkit-scrollbar { width:7px; }
    .z-ll-chips::-webkit-scrollbar-thumb { background:#555; border-radius:3px; }
    .z-ll-chip { font:10.5px 'Segoe UI'; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.14);
      color:#b8b8b8; border-radius:99px; padding:3px 9px; cursor:pointer; user-select:none; display:flex; align-items:center; gap:4px; max-width:100%; }
    .z-ll-chip:hover { border-color:var(--acc,${BRAND}); }
    .z-ll-chip.sel { background:color-mix(in srgb, var(--acc,${BRAND}) 18%, transparent); border-color:var(--acc,${BRAND}); color:#ff8a91; }
    .z-ll-chip.sel::before { content:"✓"; font-size:9px; flex:none; }
    .z-ll-chip .ct { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .z-ll-chip-none { color:#777; font-size:11px; }
    .z-ll-chip .cx { margin-left:1px; color:#ff8a91; cursor:pointer; opacity:.6; font-size:10px; flex:none; }
    .z-ll-chip .cx:hover { opacity:1; }
    .z-ll-srctoggle { margin-left:auto; display:flex; border:1px solid #2a2a2a; border-radius:99px; overflow:hidden; }
    .z-ll-srctoggle .sg { font:9px 'Segoe UI'; text-transform:none; letter-spacing:0; color:#9a9a9a; padding:2px 9px; cursor:pointer; }
    .z-ll-srctoggle .sg:hover { color:#ddd; }
    .z-ll-srctoggle .sg.on { background:${BRAND}; color:#fff; }
    .z-ll-addtrig { display:flex; gap:5px; margin-top:8px; }
    .z-ll-addtrig input { flex:1; min-width:0; box-sizing:border-box; background:#101010;
      border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#fff; font:11px 'Segoe UI';
      padding:5px 8px; outline:none; }
    .z-ll-addtrig input:focus { border-color:${BRAND}; }
    .z-ll-addtrig button { flex:0 0 auto; background:rgba(255,255,255,0.06);
      border:1px solid rgba(255,255,255,0.14); color:#ccc; border-radius:6px; padding:5px 11px;
      font:11px 'Segoe UI'; cursor:pointer; }
    .z-ll-addtrig button:hover { border-color:${BRAND}; color:#fff; }
    .z-ll-strip { margin:0 12px 11px; border-radius:7px; padding:9px 10px; font-size:11px; line-height:1.5;
      display:flex; gap:9px; align-items:flex-start; }
    .z-ll-strip .st-ic { flex:none; width:18px; height:18px; border-radius:50%; color:#fff; font-size:11px;
      display:flex; align-items:center; justify-content:center; }
    .z-ll-strip.searching { background:rgba(90,160,230,0.12); } .z-ll-strip.searching .st-ic { background:#5aa0e6; }
    .z-ll-strip.found { background:rgba(62,195,113,0.12); } .z-ll-strip.found .st-ic { background:#3ec371; }
    .z-ll-strip.nofind { background:rgba(255,255,255,0.05); } .z-ll-strip.nofind .st-ic { background:#6f6f6f; }
    .z-ll-strip.offline { background:rgba(233,165,61,0.12); } .z-ll-strip.offline .st-ic { background:#e9a53d; }
    .z-ll-spin { width:11px; height:11px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff;
      border-radius:50%; animation:z-ll-sp 1s linear infinite; }
    @keyframes z-ll-sp { to { transform:rotate(360deg); } }
    .z-ll-info-foot { display:flex; gap:6px; padding:10px 12px; border-top:1px solid #131313; background:#171717; }
    .z-ll-info-foot .b { flex:1; text-align:center; font-size:11px; padding:7px; border-radius:5px; cursor:pointer; }
    .z-ll-info-foot .b.pri { background:${BRAND}; color:#fff; font-weight:600; }
    .z-ll-info-foot .b.gh { border:1px solid rgba(255,255,255,0.14); color:#b8b8b8; }
    .z-ll-info-foot .b.gh:hover { border-color:${BRAND}; color:#fff; }
    .z-ll-info-foot .b.dis { opacity:.4; pointer-events:none; }
    .z-ll-info-foot .b.del { flex:0 0 auto; min-width:38px; border:1px solid rgba(255,255,255,0.14); color:#c9736a; }
    .z-ll-info-foot .b.del:hover { border-color:#ff2b3a; color:#fff; background:rgba(255,43,58,0.12); }
  `;
  document.head.appendChild(s);
}

export function closeInfoPanel() {
  if (_cleanup) { try { _cleanup(); } catch {} }
  _cleanup = null;
  stopFollowing();
  // Reset on CLOSE, not on open: a panel the user dragged must not teach the
  // next one to sit still where the node is not.
  _userMoved = false;
  if (_panel) { try { _panel.remove(); } catch {} }
  _panel = null;
  _ownerNode = null;
}

// Close only when THIS node owns the open panel (so deleting an unrelated LoRA
// Loader node doesn't yank away another node's open info panel).
export function closeInfoPanelFor(node) { if (_ownerNode === node) closeInfoPanel(); }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Position the panel beside its node. MUST be called BEFORE the first await, or
// the panel paints at the viewport's top-left for as long as the fetch takes:
// `.z-ll-info-p` is position:fixed with no left/top, so until this runs it sits
// at 0,0. With a cached LoRA the await resolves in a microtask and no frame ever
// paints, which is why the flash only showed after picking a NEW LoRA from the
// dropdown (a real network round trip). Same idiom as the dropdown, which places
// before its await and has never flashed.
function place(panel, node) {
  const r = getNodeRect(node);   // shared with the settings panel: has the Classic fallback
  const pad = 8, gap = 12;
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  let left = r ? r.right + gap : (window.innerWidth - pw) / 2;
  if (left + pw > window.innerWidth - pad) left = r ? Math.max(pad, r.left - gap - pw) : left;
  let top = r ? r.top : (window.innerHeight - ph) / 2;
  top = Math.max(pad, Math.min(top, window.innerHeight - ph - pad));
  panel.style.left = Math.max(pad, left) + "px";
  panel.style.top = top + "px";
}

// Nudge a panel back on-screen after it GREW (a Civitai lookup adds a status strip
// and more chips). Deliberately NOT a re-place: the header is draggable, so a full
// re-place would yank a panel the user had moved. This only corrects an edge that
// has actually gone out of view.
function clampIntoView(panel) {
  // No-op until the panel has actually been placed. renderBody() runs once BEFORE
  // the first place(), when style.left/top are still empty - without this guard
  // parseFloat("") would read 0 and pin the panel to the top-left corner, which is
  // the very flash this pass removed.
  if (!panel.style.left || !panel.style.top) return;
  const pad = 8;
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  const left = parseFloat(panel.style.left) || 0;
  const top = parseFloat(panel.style.top) || 0;
  panel.style.left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad)) + "px";
  panel.style.top = Math.max(pad, Math.min(top, window.innerHeight - ph - pad)) + "px";
}

export async function openInfoPanel(node, id, refresh) {
  closeInfoPanel();
  injectCSS();
  const entry0 = readState(node).loras.find((e) => e.id === id);
  if (!entry0) return;
  const name = entry0.name;
  const accent = accentOf(node);

  const panel = el("div", "z-ll-info-p");
  panel.style.setProperty("--acc", accent);   // body-level panel inherits nothing
  panel.style.borderColor = accent;
  document.body.appendChild(panel);
  _panel = panel;
  _ownerNode = node;
  // After _panel is assigned: the loop's first act is to check it owns the panel.
  startFollowing(panel, node);

  // view data for this panel session
  let info = { title: name || "LoRA", triggers: [], file_triggers: [], sidecar_triggers: [], source: "file", has_preview: false, custom_preview: false, preview_v: 0 };
  let civ = null; // { state:"searching"|"found"|"nofind"|"offline", info?, message? }
  // Which set of candidate words to SHOW: "file" | "civitai". null = auto (Civitai
  // when a saved sidecar / fresh lookup exists, else the file's own words). The
  // user's SELECTED words persist regardless of the view (they live in row.triggers).
  let viewSource = null;
  // Bumped whenever this panel rewrites the sidecar (Civitai fetch / delete) or the
  // user's own preview, so thumb() busts the browser's hour-long image cache.
  let _thumbBust = 0;
  // A one-line problem note under the header (a picture that could not be saved).
  // Cleared by the next thing that works.
  let _msg = null;
  // True while a picture is being encoded and uploaded, so a second drop or click
  // cannot start a competing save onto the same filename.
  let _busy = false;

  const selected = () => new Set((readState(node).loras.find((e) => e.id === id)?.triggers || []).map((w) => w.toLowerCase()));

  // A picture problem is about the LAST thing the user tried, so any other
  // deliberate action clears it. Without this the strip was sticky: drop a .txt
  // by mistake and the warning sat under the header through every chip tick and
  // every Civitai lookup for the rest of the panel's life.
  function clearMsg() { _msg = null; }

  function toggleWord(word) {
    clearMsg();
    const st = readState(node);
    const e = st.loras.find((x) => x.id === id);
    if (!e) return;
    const key = word.toLowerCase();
    const has = e.triggers.some((w) => w.toLowerCase() === key);
    const next = has ? e.triggers.filter((w) => w.toLowerCase() !== key) : [...e.triggers, word];
    patchLora(node, id, { triggers: next });
    refresh?.(false);
    renderBody();
  }
  function setWords(words) {
    clearMsg();
    patchLora(node, id, { triggers: words.slice() });
    refresh?.(false);
    renderBody();
  }

  // True when we have Civitai words available (a saved sidecar or a just-fetched result).
  function civitaiAvailable() {
    return (info.sidecar_triggers?.length || 0) > 0 || civ?.state === "found";
  }
  function fileWords() { return info.file_triggers?.length ? info.file_triggers : (info.triggers || []); }
  function civitaiWords() {
    if (info.sidecar_triggers?.length) return info.sidecar_triggers;
    if (civ?.state === "found") return civ.info?.triggers || [];
    return [];
  }
  // The active view source: honour the user's toggle, else auto.
  function effectiveSource() {
    if (viewSource === "file" || viewSource === "civitai") return viewSource;
    return civitaiAvailable() ? "civitai" : "file";
  }
  // The candidate words shown for the current view.
  function sourceWords() {
    return effectiveSource() === "civitai" ? (civitaiWords().length ? civitaiWords() : fileWords()) : fileWords();
  }

  // Chips shown: source words + the user's custom words + anything selected, de-duped.
  // `isCustom` is by MEMBERSHIP in `custom` (not push order), so a custom word that also
  // becomes a source word (e.g. after a Civitai lookup) still carries a removable ✕.
  function chipList() {
    const src = sourceWords();
    const row = readState(node).loras.find((e) => e.id === id);
    const custom = row?.custom || [];
    const customSet = new Set(custom.map((w) => w.toLowerCase()));
    const out = []; const seen = new Set();
    const push = (w) => {
      const k = w.toLowerCase();
      if (w && !seen.has(k)) { seen.add(k); out.push({ w, isCustom: customSet.has(k) }); }
    };
    for (const w of src) push(w);
    for (const w of custom) push(w);
    for (const w of (row?.triggers || [])) push(w);
    return out;
  }

  // Custom words belong to the LORA FILE, not to this row: they are kept in one
  // store in ComfyUI's user dir so they come back for the same LoRA in any row,
  // node or workflow. The row still holds a copy (that is what chipList and the
  // ticked `triggers` read), so this writes BOTH - the row for right now, the
  // store so it survives.
  function persistCustom(words) {
    if (!name) return;
    saveCustomTriggers(name, words);   // fire and forget: the row already has it
  }

  function addCustom(word) {
    clearMsg();
    const w = (word || "").trim();
    if (!w) return;
    const e = readState(node).loras.find((x) => x.id === id);
    if (!e) return;
    const key = w.toLowerCase();
    // If the file / Civitai already offers this word, just select it - don't also stash
    // it in `custom` (that would be a hidden duplicate of a source word).
    const inSrc = sourceWords().some((x) => x.toLowerCase() === key);
    const custom = (inSrc || (e.custom || []).some((x) => x.toLowerCase() === key))
      ? (e.custom || []) : [...(e.custom || []), w];
    const trig = (e.triggers || []).some((x) => x.toLowerCase() === key) ? e.triggers : [...(e.triggers || []), w];
    patchLora(node, id, { custom, triggers: trig }); // added = selected, so it reaches the output
    persistCustom(custom);
    refresh?.(false);
    renderBody();
    setTimeout(() => panel.querySelector(".z-ll-addtrig input")?.focus(), 0);
  }

  function removeCustom(word) {
    clearMsg();
    const key = (word || "").toLowerCase();
    const e = readState(node).loras.find((x) => x.id === id);
    if (!e) return;
    const custom = (e.custom || []).filter((x) => x.toLowerCase() !== key);
    patchLora(node, id, {
      custom,
      triggers: (e.triggers || []).filter((x) => x.toLowerCase() !== key),
    });
    persistCustom(custom);
    refresh?.(false);
    renderBody();
  }

  // Bring the stored words for THIS LoRA onto the row when the panel opens.
  // Also migrates the other way: a row that already carried custom words from
  // before the store existed (or from a workflow made on another machine) pushes
  // them INTO the store, so nobody's existing words are lost by this change.
  function hydrateCustom() {
    const stored = Array.isArray(info?.custom_triggers) ? info.custom_triggers : [];
    const e = readState(node).loras.find((x) => x.id === id);
    if (!e) return;
    const rowWords = e.custom || [];
    const seen = new Set();
    const merged = [];
    for (const w of [...stored, ...rowWords]) {
      const k = String(w || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      merged.push(w);
    }
    // Only touch state when something actually changed - a no-op write would
    // dirty a clean workflow every time the panel is opened (Vue Compat #18).
    const same = merged.length === rowWords.length
      && merged.every((w, i) => w === rowWords[i]);
    if (!same) { patchLora(node, id, { custom: merged }); refresh?.(false); }
    // Push back only when the row is carrying something the store lacks.
    if (merged.length > stored.length) persistCustom(merged);
  }

  function autoTickTriggers() { autoTickFromInfo(node, id, info, refresh); }

  function thumb() {
    // The user's OWN picture outranks everything, a live Civitai result included.
    // "Replace it with my own" has to survive the next ↻ Civitai, or the override
    // would quietly undo itself the first time they looked the LoRA up again.
    // preview_v is the file's mtime, so a picture set in ANOTHER node or an
    // earlier session still gets past the browser's hour-long image cache.
    if (info.custom_preview && name) {
      return thumbUrl(name, Math.max(_thumbBust, info.preview_v || 0));
    }
    if (civ?.state === "found" && civ.info?.thumbnail) return civ.info.thumbnail;
    // _thumbBust is set when THIS panel changed the sidecar (Civitai fetch/delete):
    // the thumb URL never changes and the route sends max-age=3600, so without the
    // bust the browser kept showing the pre-change image for up to an hour.
    if (info.has_preview && name) return thumbUrl(name, _thumbBust);
    return null;
  }

  // ── the user's own preview picture ─────────────────────────────────────────
  //
  // Click the box to pick a file, drop one on it, or paste one. It is saved in
  // ComfyUI's user folder (never into the models folder, which is often read-only
  // or a network share) and simply WINS over the Civitai picture; Remove puts the
  // automatic one back, so nothing they already had is ever destroyed.

  const PREVIEW_MAX = 512;   // longest side; the box shows 64px, and a 4K drop is
                             // otherwise megabytes of upload for a thumbnail

  /** The gear's "Show preview thumbnails". Re-read on every render (the same idiom
   *  as `civitaiOn`) so a gear toggle is never stale. When it is off the picture box
   *  is not built at all - a Civitai preview appears the moment the i button is
   *  clicked, which is the whole point of being able to turn it off while
   *  recording, so leaving an empty square (or a live drop target) behind would
   *  miss it. Everything below therefore has to cope with the box being absent. */
  function thumbsOn() { return readState(node).thumbs !== false; }

  /** Downscale to a small jpeg in the BROWSER, so the upload is tens of KB and the
   *  server needs no image library. The server still checks the size and the magic
   *  bytes - this is for weight, not for trust. */
  function toPreviewDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0) { reject(new Error("That file is not a picture.")); return; }
          const k = Math.min(1, PREVIEW_MAX / Math.max(w0, h0));
          const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          // A jpeg carries no transparency, so a png with alpha would come out on
          // BLACK. Paint the panel's own dark background under it instead.
          ctx.fillStyle = "#141414";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", 0.9));
        } catch (err) { reject(err); }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("That file is not a picture the browser can show."));
      };
      img.src = url;
    });
  }

  // Touches the live element rather than re-rendering: a full renderBody() here
  // would rebuild the header twice per save for no visible gain. The hint has to
  // move WITH the class - a render that happened while busy left "Saving…" as the
  // hover label after the class came off.
  function setBusy(v) {
    _busy = !!v;
    const t = panel.querySelector(".z-ll-info-th");
    if (!t) return;
    t.classList.toggle("busy", _busy);
    t.dataset.hint = hintFor();
  }

  function hintFor() { return _busy ? "Saving…" : (thumb() ? "Change" : "+ Picture"); }

  /**
   * Load this LoRA's info and adopt it - unless a NEWER load has started since,
   * in which case this answer is simply out of date and must be dropped.
   *
   * Every info load in this panel takes a ticket, because more than one can be
   * in flight at once and they can land out of order: clicking ↻ Civitai starts
   * one, dropping a picture a moment later starts another, and if the second
   * answers first the slower Civitai answer would then overwrite it - putting
   * `custom_preview:false` back and making the picture and its ✕ vanish with no
   * way to get them back short of reopening. `panel.isConnected` alone does not
   * catch that: both requests belong to the SAME live panel.
   *
   * `.stale` (from api.mjs) is a different signal and both are needed: it means
   * the data is known out of date because something invalidated this LoRA while
   * the request was out, whether or not this panel started anything newer.
   */
  let _infoSeq = 0;
  let _hydrated = false;

  async function attemptInfo(force) {
    const ticket = ++_infoSeq;
    const j = await loraInfo(name, force);
    if (!panel.isConnected) return "dead";
    if (ticket !== _infoSeq) return "superseded";   // someone newer owns the answer
    if (!j?.ok || !j.info) return "failed";
    if (j.stale) return "stale";                    // known out of date, do not paint it
    info = j.info;
    // Exactly once per panel, on whichever load first succeeds. Tying this to the
    // FIRST load alone is what lost it: when that load came back stale or
    // superseded, hydrateCustom - which has no other call site - never ran, and
    // the user's stored trigger words never reached the row.
    // Both run exactly once per panel, on whichever load first succeeds, and in
    // this order: the stored custom words come onto the row first so autoTick
    // sees the row's real contents before deciding what to add.
    if (!_hydrated) { _hydrated = true; hydrateCustom(); autoTickTriggers(); }
    return "ok";
  }

  /** Load this LoRA's info and adopt it. A stale answer is asked again, ONCE. */
  async function loadInfo({ force = false } = {}) {
    const r = await attemptInfo(force);
    // "stale" means something invalidated this LoRA while the request was out.
    // Dropping it is right; stopping there is not, because for some invalidators
    // (a custom word being saved) nothing else would ever refresh us. So ask
    // again, forced, exactly once - never a loop.
    if (r === "stale") return await attemptInfo(true);
    return r;
  }

  async function reloadInfo() {
    await loadInfo({ force: true });
    if (!panel.isConnected) return;
    renderBody();
  }

  async function applyPicture(blob) {
    if (!name || _busy) return;
    if (!blob || !/^image\//.test(blob.type || "")) {
      showMsg("That is not a picture. Use a jpg, png or webp.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await toPreviewDataUrl(blob);
      const res = await saveLoraPreview(name, dataUrl);
      if (!panel.isConnected) return;
      if (!res?.ok) { showMsg(res?.message || "Could not save that picture."); return; }
      _msg = null;
      _thumbBust = res.v || Date.now();
      await reloadInfo();          // custom_preview / has_preview / preview_v
    } catch (err) {
      if (panel.isConnected) showMsg(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function removePicture() {
    if (!name || _busy) return;
    setBusy(true);
    try {
      const res = await deleteLoraPreview(name);
      if (!panel.isConnected) return;
      if (!res?.ok) { showMsg(res?.message || "Could not remove that picture."); return; }
      _msg = null;
      _thumbBust = Date.now();     // back to the automatic picture, past the 1h cache
      await reloadInfo();
    } finally {
      setBusy(false);
    }
  }

  function pickPicture() {
    if (_busy) return;
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (f) applyPicture(f);
    });
    // A CANCELLED dialog fires no `change` at all, so the input would sit in the
    // body forever. The window regaining focus is the one signal both paths share.
    window.addEventListener("focus", () => setTimeout(() => inp.remove(), 800), { once: true });
    inp.click();
  }

  /** A URL dropped rather than a file - an image dragged from ComfyUI's own output
   *  preview, say. Same-origin ONLY: anything else would have us fetching an
   *  arbitrary site on the user's behalf, and a cross-origin picture taints the
   *  canvas so toDataURL could not read it back anyway. */
  async function pictureFromUrl(url) {
    // The fetch below is an await with no busy flag set, so without this a URL
    // drop and a file drop could both be accepted and land in the wrong order.
    if (_busy) return;
    let u = null;
    try { u = new URL(url, window.location.href); } catch { u = null; }
    if (!u || u.origin !== window.location.origin) {
      showMsg("Drag the picture file itself from your computer, or copy the image and paste it here.");
      return;
    }
    try {
      const r = await fetch(u.href);
      if (!r.ok) throw new Error("Could not read that image.");
      await applyPicture(await r.blob());
    } catch (err) {
      if (panel.isConnected) showMsg(String(err?.message || err));
    }
  }

  /**
   * A drop anywhere on the PANEL, not just on the 64px box.
   *
   * Measured: a file released 10px wide of the box left our code entirely,
   * bubbled to document, and ComfyUI turned it into a Load Image node on the
   * canvas BEHIND the panel (node count 2 -> 3). A feature that invites people to
   * drag a file at a 64px target inside a 340px panel has to catch the near miss.
   *
   * So the panel swallows every drop on itself: routed to the picture when it is
   * an image and pictures are on, and simply cancelled otherwise. Wired ONCE on
   * the persistent panel element (renderBody rebuilds its children), before the
   * box's own handlers see anything, and the box still stops propagation so a
   * bullseye is not handled twice.
   */
  function wirePanelDrop(p) {
    // The cursor must promise exactly what the drop will do. Gating the two on
    // DIFFERENT conditions showed a "copy" cursor on a row with no LoRA and then
    // did nothing at all when released - a silent no-op is worse than a refusal.
    const takes = () => thumbsOn() && !!name;
    p.addEventListener("dragover", (ev) => {
      ev.preventDefault();               // "a drop is allowed here", i.e. not the canvas
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = takes() ? "copy" : "none";
    });
    p.addEventListener("drop", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!takes()) return;               // swallowed, deliberately: no picture slot on offer
      const f = ev.dataTransfer?.files && ev.dataTransfer.files[0];
      if (f) { applyPicture(f); return; }
      // Not a file. Say where the picture goes - but NOT when the release landed
      // in the add-a-word field: showMsg re-renders, and renderBody builds that
      // input fresh, so a half-typed word would be thrown away for a stray drag.
      if (!ev.target.closest?.(".z-ll-addtrig")) {
        showMsg("Drop the picture onto the small box at the top left.");
      }
    });
  }

  function wireThumb(th, hasOwn) {
    th.dataset.hint = hintFor();
    if (_busy) th.classList.add("busy");
    th.title = "Click to use your own picture for this LoRA. You can also drop an image "
      + "here, or copy one and press Ctrl+V.";
    th.addEventListener("click", (ev) => {
      if (ev.target.closest(".z-ll-thx")) return;   // the remove badge has its own job
      pickPicture();
    });
    if (hasOwn) {
      const rm = el("span", "z-ll-thx", "✕");
      rm.title = "Remove your picture (the automatic one comes back)";
      rm.addEventListener("click", (ev) => { ev.stopPropagation(); removePicture(); });
      th.appendChild(rm);
    }
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    th.addEventListener("dragenter", (ev) => { stop(ev); th.classList.add("drop"); });
    th.addEventListener("dragover", (ev) => {
      stop(ev);
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      th.classList.add("drop");
    });
    th.addEventListener("dragleave", (ev) => {
      // A leave whose relatedTarget is still inside the box is the cursor crossing
      // the overlay or the ✕, not leaving - without this the highlight flickers.
      if (ev.relatedTarget && th.contains(ev.relatedTarget)) return;
      th.classList.remove("drop");
    });
    th.addEventListener("drop", (ev) => {
      stop(ev);
      th.classList.remove("drop");
      const dt = ev.dataTransfer;
      const f = dt?.files && dt.files[0];
      if (f) { applyPicture(f); return; }
      const raw = (dt?.getData("text/uri-list") || dt?.getData("text/plain") || "").trim();
      const first = raw.split(/[\r\n]+/).find((x) => x && !x.startsWith("#"));
      if (first) pictureFromUrl(first);
      else showMsg("Nothing to use there. Drop an image file.");
    });
  }

  function showMsg(m) { _msg = m || null; renderBody(); }

  function msgStrip() {
    const strip = el("div", "z-ll-strip offline");
    strip.append(el("span", "st-ic", "!"), el("div", null, _msg));
    return strip;
  }

  function renderBody() {
    panel.innerHTML = "";
    const sel = selected();
    const civitaiOn = readState(node).civitai; // re-read so a settings toggle isn't stale

    // ── header ───────────────────────────────────────────────────────────
    const top = el("div", "z-ll-info-top");
    // The picture box - only when the gear has pictures on AND the row actually
    // has a LoRA. On a nameless row (add a row, dismiss the picker) there is
    // nothing to set a picture FOR, and the box was a dead affordance: it kept
    // its pointer cursor and darkened on hover to show an empty label, because
    // the hint is only written by wireThumb.
    let th = null;
    if (thumbsOn() && name) {
      th = el("div", "z-ll-info-th");
      const turl = thumb();
      // Strip quotes/backslashes so a stray char in a Civitai image URL can't break the
      // CSS url() value (thumbUrl(name, bust) is already percent-encoded; civ.info.thumbnail is raw).
      if (turl) th.style.backgroundImage = `url("${String(turl).replace(/["\\]/g, "")}")`;
      // Pick / drop / paste your own picture, and remove it again. Wired on every
      // render because renderBody() builds a fresh header each time.
      wireThumb(th, !!info.custom_preview);
    }
    const h = el("div", "z-ll-info-h");
    const title = el("h3", null, (civ?.state === "found" && civ.info?.name) || info.title || "LoRA");
    const metaBits = [];
    if (info.base_model) metaBits.push(info.base_model);
    if (info.rank) metaBits.push("rank " + info.rank + (info.alpha ? " / α" + info.alpha : ""));
    if (info.num_images) metaBits.push(info.num_images + " imgs");
    if (info.date) metaBits.push(String(info.date).slice(0, 10));
    const meta = el("div", "z-ll-info-meta");
    meta.innerHTML = (metaBits.length ? escapeHtml(metaBits.join(" · ")) : "&nbsp;") +
      "<br>" + escapeHtml(name || "");
    h.append(title, meta);
    // Link to the Civitai model page when we know the id. Take BOTH ids from ONE
    // source (a live lookup, else the offline/cached info) so the model+version pair
    // can't be mixed across sources.
    const idSrc = (civ?.state === "found") ? civ.info : info;
    const mid = idSrc?.model_id;
    const vid = idSrc?.version_id;
    if (mid != null) {
      const link = el("span", "z-ll-civlink", "View on Civitai ↗");
      link.addEventListener("click", () => {
        const u = "https://civitai.com/models/" + mid + (vid ? "?modelVersionId=" + vid : "");
        window.open(u, "_blank", "noopener");
      });
      h.appendChild(link);
    }
    const x = el("span", "z-ll-info-x", "✕");
    x.addEventListener("click", closeInfoPanel);
    if (th) top.append(th, h, x); else top.append(h, x);
    panel.appendChild(top);

    // ── a problem with the picture, when there was one ───────────────────
    if (_msg) panel.appendChild(msgStrip());

    // ── optional Civitai status strip ────────────────────────────────────
    if (civ) panel.appendChild(civStrip());

    // ── trigger words ────────────────────────────────────────────────────
    const sec = el("div", "z-ll-info-sec");
    const head = el("h4");
    head.appendChild(el("span", null, "Trigger words"));
    const all = el("span", "qa", "all");
    all.title = "Select every word";
    all.addEventListener("click", () => setWords(chipList().map((c) => c.w)));
    const none = el("span", "qa", "none");
    none.title = "Clear selection";
    none.addEventListener("click", () => setWords([]));
    head.append(all, none);
    // Source: a File / Civitai toggle only when the file has its OWN words AND Civitai
    // words exist (gate on file_triggers, NOT fileWords() - the latter falls back to the
    // merged sidecar list, which for a sidecar-only LoRA would show a bogus "File" tab
    // holding Civitai words). Otherwise a plain badge.
    if (civitaiAvailable() && (info.file_triggers?.length || 0) > 0) {
      const es = effectiveSource();
      const seg = el("div", "z-ll-srctoggle");
      const fBtn = el("span", "sg" + (es === "file" ? " on" : ""), "File");
      fBtn.title = "Show the LoRA's own words (from the file)";
      fBtn.addEventListener("click", () => { viewSource = "file"; renderBody(); });
      const cBtn = el("span", "sg" + (es === "civitai" ? " on" : ""), "Civitai");
      cBtn.title = "Show the saved Civitai words";
      cBtn.addEventListener("click", () => { viewSource = "civitai"; renderBody(); });
      seg.append(fBtn, cBtn);
      head.appendChild(seg);
    } else {
      const srcBadge = el("span", "src" + (info.source === "civitai" ? " net" : ""),
        civ?.state === "found" ? "from Civitai" : info.source === "sidecar" ? "from Civitai (saved)" : "from file");
      head.appendChild(srcBadge);
    }
    sec.appendChild(head);
    sec.appendChild(el("p", "z-ll-info-note",
      "Tap the ones you want. Only these, and only if the LoRA is on, reach the triggers output."));

    const chips = el("div", "z-ll-chips");
    const list = chipList();
    if (!list.length) {
      chips.appendChild(el("span", "z-ll-chip-none",
        "No trigger words in this file - add your own below" + (civitaiOn ? ", or try Civitai." : ".")));
    } else {
      for (const { w, isCustom } of list) {
        const c = el("span", "z-ll-chip" + (sel.has(w.toLowerCase()) ? " sel" : ""));
        c.title = w;                              // full text on hover (chips truncate to one line)
        c.appendChild(el("span", "ct", w));
        c.addEventListener("click", () => toggleWord(w));
        if (isCustom) {
          const x = el("span", "cx", "✕");
          x.title = "Remove this custom word";
          x.addEventListener("click", (ev) => { ev.stopPropagation(); removeCustom(w); });
          c.appendChild(x);
        }
        chips.appendChild(c);
      }
    }
    sec.appendChild(chips);

    // ── add your own trigger word (persists on this LoRA) ────────────────────
    const addRow = el("div", "z-ll-addtrig");
    const inp = el("input");
    inp.type = "text";
    inp.placeholder = "add your own trigger word…";
    inp.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); addCustom(inp.value); }
    });
    const addBtn = el("button", null, "Add");
    addBtn.addEventListener("click", () => addCustom(inp.value));
    addRow.append(inp, addBtn);
    sec.appendChild(addRow);

    panel.appendChild(sec);

    // ── footer ───────────────────────────────────────────────────────────
    const foot = el("div", "z-ll-info-foot");
    const done = el("div", "b pri", "Done");
    done.addEventListener("click", closeInfoPanel);
    foot.appendChild(done);
    if (civitaiOn && name) {
      const searching = civ?.state === "searching";
      const cbtn = el("div", "b gh" + (searching ? " dis" : ""), searching ? "Looking up…" : "↻ Civitai");
      if (!searching) cbtn.addEventListener("click", runCivitai);
      foot.appendChild(cbtn);
    }
    // Delete the saved Civitai info (only when a sidecar exists) - reverts to the file's words.
    if ((info.sidecar_triggers?.length || 0) > 0) {
      const del = el("div", "b del", "🗑");
      del.title = "Delete the saved Civitai info (back to the file's own words)";
      del.addEventListener("click", runDeleteCivitai);
      foot.appendChild(del);
    }
    panel.appendChild(foot);
    // Every re-render can change the panel's height (ticking a word, adding a
    // custom one, switching the File/Civitai view, a lookup landing). Clamping
    // here covers all of them from one place instead of per call site, so the
    // footer can never end up pushed off the bottom of the screen.
    clampIntoView(panel);
  }

  function civStrip() {
    const strip = el("div", "z-ll-strip " +
      (civ.state === "searching" ? "searching" : civ.state === "found" ? "found"
        : civ.state === "offline" ? "offline" : "nofind"));
    const ic = el("span", "st-ic");
    if (civ.state === "searching") ic.appendChild(el("span", "z-ll-spin"));
    else ic.textContent = civ.state === "found" ? "✓" : civ.state === "offline" ? "!" : "?";
    const body = el("div");
    if (civ.state === "searching") body.textContent = "Looking up on Civitai… matching this file's fingerprint.";
    else if (civ.state === "found") body.innerHTML = "Found on Civitai. Saved next to the file, so it's instant and offline next time.";
    else if (civ.state === "nofind") body.innerHTML = "Not on Civitai. This exact file isn't in their database (it may be private, renamed, or custom-trained). The words read from the file are still shown.";
    else body.textContent = civ.message || "Couldn't reach Civitai. No connection, or it's busy. Use the file's own words, or try again.";
    strip.append(ic, body);
    return strip;
  }

  async function runCivitai() {
    clearMsg();
    civ = { state: "searching" };
    renderBody();
    const res = await civitaiLookup(name);
    if (!panel.isConnected) return;
    if (res.ok && res.found) {
      civ = { state: "found", info: res.info || {} };
      viewSource = "civitai";               // found on Civitai -> switch the view to its words
      _thumbBust = Date.now();              // the lookup may have written a new preview
      invalidateInfo(name);
      // refresh offline info so the source badge / cached ids reflect the new sidecar,
      // then repaint. Through loadInfo, so this slow answer cannot overwrite a
      // picture the user set while the lookup was still running.
      loadInfo({ force: true }).then((ok) => { if (ok) renderBody(); });
    } else if (res.reason === "notfound") {
      civ = { state: "nofind" };
    } else {
      civ = { state: "offline", message: res.message };
    }
    renderBody();   // renderBody re-clamps: the status strip makes the panel taller
  }

  async function runDeleteCivitai() {
    clearMsg();
    await deleteCivitai(name);
    if (!panel.isConnected) return;
    _thumbBust = Date.now();              // the sidecar (and so the preview) changed
    invalidateInfo(name);                 // drop the cached (sidecar-flavoured) info
    civ = null;
    viewSource = "file";                  // nothing to toggle to now - show the file words
    await loadInfo({ force: true });
    if (!panel.isConnected) return;
    renderBody();
  }

  // Initial paint from cache, then the real offline read. Place TWICE: once now,
  // so the panel is never visible at 0,0 while the fetch is in flight, and again
  // once the content is final so it sits correctly against its true height.
  renderBody();
  place(panel, node);
  // WIRED BEFORE THE AWAIT. The panel is on screen and interactive for the whole
  // of the load below, so arming the drop catch afterwards left a window in which
  // a file dropped on it escaped to ComfyUI and became a Load Image node on the
  // canvas - the very thing this exists to stop. Same reasoning as place()
  // above, which is called before the await for the same "it is already visible"
  // reason. Both only touch the panel element, which exists by now.
  dragBy(panel);
  wirePanelDrop(panel);

  await loadInfo();
  if (!panel.isConnected) return;
  renderBody();
  place(panel, node);

  const onDown = (e) => { if (!panel.contains(e.target) && !e.target.closest?.(".z-ll-dd")) closeInfoPanel(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeInfoPanel(); } };
  // Ctrl+V sets the LoRA's picture from the clipboard. On CAPTURE and stopping
  // propagation, because ComfyUI pastes an image onto the CANVAS as a node - with
  // this panel open that is never what was meant, and both happening at once is
  // worse than either. Only when an image is really taken: an ordinary text paste
  // falls through untouched.
  const onPaste = (e) => {
    if (!panel.isConnected || !name) return;
    // With pictures switched off there is no box, so a paste would set a picture
    // the user cannot see and cannot remove. Leave the paste alone instead.
    if (!thumbsOn()) return;
    // Never steal a paste aimed at a text box - the "add your own trigger word"
    // field is right there, and pasting a word into it has to keep working.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    for (const it of (e.clipboardData?.items || [])) {
      if (it.kind !== "file" || !/^image\//.test(it.type || "")) continue;
      const f = it.getAsFile();
      if (!f) continue;
      e.preventDefault();
      e.stopPropagation();
      applyPicture(f);
      return;
    }
  };
  setTimeout(() => {
    if (_panel !== panel) return; // closed/replaced in the same tick - don't orphan listeners
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste, true);
  }, 0);
  _cleanup = () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("paste", onPaste, true);
  };
}

/**
 * Keep the info panel beside its node while the canvas moves - the same loop the
 * settings panel uses, because the two open from the same node and anchor the
 * same way, so one following and the other stranding reads as a bug in whichever
 * you noticed second.
 *
 * A rAF loop rather than an event: LiteGraph emits nothing for a transform
 * change. It compares three numbers per frame, so idle cost is nil, and it only
 * runs while a panel is open. Stops the moment the user drags the panel.
 *
 * ⚠️ rAF is throttled almost to a standstill in the in-app browser (the pane is
 * not displayed), so this looks completely dead when tested there. Pump frames.
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
    if (sc === lastScale && ox === lastX && oy === lastY) return;
    lastScale = sc; lastX = ox; lastY = oy;
    place(panel, node);
  };
  _followRaf = requestAnimationFrame(tick);
}

function stopFollowing() {
  if (_followRaf != null) cancelAnimationFrame(_followRaf);
  _followRaf = null;
}

function dragBy(panel) {
  // Delegate on the PERSISTENT panel: renderBody() rebuilds the header on every
  // re-render (chip tick / Civitai state change), so wiring the header element itself
  // would go dead after the first re-render.
  panel.addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.(".z-ll-info-top")) return;
    // Every CLICKABLE thing inside the drag handle must bail out here, not just
    // the ✕. Once setPointerCapture is set on the panel, Chromium retargets that
    // pointer's mouseup - and therefore its click - to the capture element, so the
    // clicked child never sees the click at all, and releasing capture on pointerup
    // does not undo it. That silently killed "View on Civitai ↗": the link is in
    // the header, so it was captured and stopped opening the model page.
    if (e.target.closest(".z-ll-info-x, .z-ll-civlink, .z-ll-info-th")) return;
    const r = panel.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;

    // BOTH defences against a drag that sticks to the cursor: a pointerup can
    // genuinely go missing (released outside the window, on a second monitor, or
    // swallowed upstream) and synthetic events never reproduce it.
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }

    const move = (ev) => {
      if (!panel.isConnected) return up();
      if (!(ev.buttons & 1)) return up();
      // From here the panel is where the USER put it, so stop following the node.
      _userMoved = true;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, ev.clientX - ox)) + "px";
      panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, ev.clientY - oy)) + "px";
    };
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
