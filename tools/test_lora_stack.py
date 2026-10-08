#!/usr/bin/env python3
"""Tests for the v0.36.0 LoRA-stack recorder (Boss's Oct 7 idea, built Oct 8).

Covers _lora_helpers.build_stack_string — the pure renderer behind the
LoRAs Loader's new `lora_stack` output — standalone, no ComfyUI needed.
Run: python3 tools/test_lora_stack.py (from pack root)
"""
import importlib.util
import sys
import types

HELPERS = "/home/rock/Syncthing/ComfyUI_nodes/ComfyUI-ZeonmkII-Nodes/nodes/_lora_helpers.py"

# Stub folder_paths defensively (helpers may import it for preview paths).
fp = types.ModuleType("folder_paths")
def _no_key(key):
    raise KeyError(key)
fp.get_folder_paths = _no_key
fp.base_path = None
sys.modules["folder_paths"] = fp

spec = importlib.util.spec_from_file_location("_lora_helpers", HELPERS)
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)

FAILS = []

def check(name, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)

def row(name="a.safetensors", on=True, sm=0.8, sc=None):
    return {"name": name, "on": on, "sm": sm, "sc": sm if sc is None else sc, "triggers": []}

b = H.build_stack_string

# 1) empty / none
check("empty list -> ''", b([]) == "")
check("None -> ''", b(None) == "")

# 2) the happy path: two ON rows, strengths equal on both channels
s = b([row("samura.safetensors", True, 0.8), row("boichi.safetensors", True, 0.6)])
check("two rows joined", s == "samura.safetensors:0.8, boichi.safetensors:0.6", s)

# 3) OFF rows never listed (defense in depth — loader pre-filters too)
check("off row excluded", b([row("x", False, 0.9)]) == "")

# 4) clip strength shown only when CLIP wired AND differs
check("clip differs -> name:m/c", b([row("n", True, 0.8, sc=0.6)], True) == "n:0.8/0.6")
check("clip same -> name:m", b([row("n", True, 0.8, sc=0.8)], True) == "n:0.8")
check("no clip -> clip strength ignored", b([row("n", True, 0.8, sc=0.6)], False) == "n:0.8")

# 5) deliberate zero-strength park stays listed (user switched it on on purpose)
check("zero park listed as :0", b([row("parked", True, 0.0)]) == "parked:0")

# 6) %g formatting — no float noise, integers collapse
check("0.85 stays 0.85", "n:0.85" in b([row("n", True, 0.85)]))
check("1.0 renders as 1", b([row("n", True, 1.0)]) == "n:1")

# 7) junk tolerated, never raises
check("non-dict skipped", b(["junk", row("ok", True, 0.5)], True) == "ok:0.5")
check("nameless skipped", b([{"on": True, "sm": 0.5, "sc": 0.5}]) == "")
check("string strengths coerced", b([{"name": "s", "on": True, "sm": "0.7", "sc": "0.7"}]) == "s:0.7")

# 8) row order preserved (metadata mirrors apply order)
s = b([row("first", True, 0.9), row("second", True, 0.4), row("third", True, 0.1)])
check("order preserved", s == "first:0.9, second:0.4, third:0.1", s)

# 9) merge_stack_texts (v0.36.1: style + character onto one LoRAs: line)
m = H.merge_stack_texts
check("merge: both parts", m("a:0.8", "c:0.7") == "a:0.8, c:0.7")
check("merge: empty part skipped", m("", "c:0.7") == "c:0.7")
check("merge: whitespace-only skipped", m("  ", "c:0.7") == "c:0.7")
check("merge: all empty -> ''", m("", "  ", None) == "")
check("merge: strips parts", m(" a:0.8 ", "c:0.7") == "a:0.8, c:0.7")
check("merge: no args -> ''", m() == "")

print()
if FAILS:
    print(f"RESULT: {len(FAILS)} FAILED: {FAILS}")
    sys.exit(1)
print("RESULT: ALL GREEN")
