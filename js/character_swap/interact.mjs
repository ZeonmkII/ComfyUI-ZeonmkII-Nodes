// ZeonmkII Character Swap — all row events. ONE delegated set of listeners on the
// widget element dispatches on the data-act attributes rows.mjs stamps (same
// pattern as the loader's interaction.mjs). Every write lands on the native
// widget (widget.value = ...), and the value interceptors in index.js repaint
// the view — the DOM never holds state of its own.

import { openLoraDropdown } from "../lora_loader/dropdown.mjs";
import { ZEON } from "../zeonmkii_skin.js";
import { findWidget, MAX_SLOTS } from "./rows.mjs";

const CFG_NAME = { chars: "char_count", pick: "selection", rmin: "random_min", rmax: "random_max" };
const TEXT_ACTS = new Set(["nval", "wmval", "wcval", "tval"]);
const STRENGTH_MIN = -10;
const STRENGTH_MAX = 10;
const STRENGTH_STEP = 0.05; // matches the Python widget step

function countOf(node) {
  const n = parseInt(findWidget(node, "char_count")?.value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_SLOTS, n)) : 4;
}
function getV(node, name) { return findWidget(node, name)?.value; }
function setV(node, name, v) { const w = findWidget(node, name); if (w) w.value = v; }
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampStrength(v) {
  const f = parseFloat(v);
  if (!Number.isFinite(f)) return null;
  return Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, Math.round(f * 100) / 100));
}

// chars tops out at the hard 8-slot limit; the other three at the live count
// (Python normalizes lo>hi, the UI just keeps every value sane on its own).
function clampConfig(key, node, v) {
  const max = key === "chars" ? MAX_SLOTS : countOf(node);
  return clampInt(v, 1, max);
}

function slotOf(el) { return parseInt(el?.dataset?.i || "0", 10) || 0; }

function pickLora(node, i, anchorEl, refresh) {
  const current = String(getV(node, `lora_${i}`) ?? "") || "";
  openLoraDropdown(anchorEl, {
    current: current === "None" ? "" : current,
    accent: ZEON.ACCENT,
    onPick: (name) => { setV(node, `lora_${i}`, name); refresh(false); },
  });
}

export function attachInteractions(node, widgetEl, refresh) {
  widgetEl.addEventListener("click", (ev) => {
    const t = ev.target;
    if (TEXT_ACTS.has(t?.dataset?.act)) return; // let the field take focus
    const actEl = t.closest?.("[data-act]");
    if (!actEl) return;
    ev.stopPropagation();
    const act = actEl.dataset.act;
    const i = slotOf(actEl);
    const k = actEl.dataset.k || "";

    if (act === "name") { pickLora(node, i, actEl, refresh); return; }
    if (act === "none") {
      // Text-only toggle: ON → click opens the picker to choose a real LoRA;
      // OFF → become text-only ("None" — the swap still happens, no LoRA applied).
      const cur = String(getV(node, `lora_${i}`) ?? "None") || "None";
      if (cur === "None") pickLora(node, i, actEl, refresh);
      else setV(node, `lora_${i}`, "None");
      refresh(false);
      return;
    }
    if (act === "toggle") {
      setV(node, `enabled_${i}`, getV(node, `enabled_${i}`) === false);
      refresh(false);
      return;
    }
    if (act === "winc" || act === "wdec") {
      const cur = parseFloat(getV(node, `strength_model_${i}`)) || 0;
      const s = clampStrength(cur + (act === "winc" ? STRENGTH_STEP : -STRENGTH_STEP));
      if (s != null) setV(node, `strength_model_${i}`, s);
      refresh(false);
      return;
    }
    if (act === "wcinc" || act === "wcdec") {
      const cur = parseFloat(getV(node, `strength_clip_${i}`)) || 0;
      const s = clampStrength(cur + (act === "wcinc" ? STRENGTH_STEP : -STRENGTH_STEP));
      if (s != null) setV(node, `strength_clip_${i}`, s);
      refresh(false);
      return;
    }
    if (act === "ninc" || act === "ndec") {
      const name = CFG_NAME[k];
      if (!name) return;
      const cur = parseInt(getV(node, name), 10) || 1;
      setV(node, name, clampConfig(k, node, cur + (act === "ninc" ? 1 : -1)));
      refresh(false);
      return;
    }
  });

  // Commit typed values on change (fires on blur / Enter).
  widgetEl.addEventListener("change", (ev) => {
    const el = ev.target;
    const act = el?.dataset?.act;
    if (!act) return;
    const i = slotOf(el);
    const k = el.dataset.k || "";
    if (act === "nval") {
      const name = CFG_NAME[k];
      if (!name) return;
      const v = parseInt(el.value, 10);
      setV(node, name, Number.isFinite(v) ? clampConfig(k, node, v) : (parseInt(getV(node, name), 10) || 1));
      refresh(false);
      return;
    }
    if (act === "wmval" || act === "wcval") {
      const s = clampStrength(el.value);
      if (s == null) { refresh(false); return; } // garbage typed → repaint reverts to stored value
      setV(node, act === "wmval" ? `strength_model_${i}` : `strength_clip_${i}`, s);
      refresh(false);
      return;
    }
    if (act === "tval") {
      setV(node, `trigger_${i}`, String(el.value ?? ""));
      refresh(false);
      return;
    }
  });

  // Focus a numeric field → select its text for quick overwrite.
  widgetEl.addEventListener("focusin", (ev) => {
    const act = ev.target?.dataset?.act;
    if (act === "nval" || act === "wmval" || act === "wcval") ev.target.select?.();
  });

  // Keep typing inside a field from triggering canvas shortcuts; Enter commits.
  widgetEl.addEventListener("keydown", (ev) => {
    if (!TEXT_ACTS.has(ev.target?.dataset?.act)) return;
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); }
  });
}
