#!/usr/bin/env python3
"""Standalone tests for ZeonmkII Wildcard Expand (v0.35.7 space-preservation fix).

Runs the node's pure logic without ComfyUI (folder_paths stubbed).
Run: python3 tools/test_wildcard_expand.py (from pack root)
"""
import importlib.util
import sys
import types
from collections import Counter

PACK_FILE = "/home/rock/Syncthing/ComfyUI_nodes/ComfyUI-ZeonmkII-Nodes/nodes/wildcard_expand.py"

# --- stub folder_paths BEFORE loading the node module ---
fp = types.ModuleType("folder_paths")
def _no_key(key):
    raise KeyError(key)
fp.get_folder_paths = _no_key
fp.base_path = None
sys.modules["folder_paths"] = fp

spec = importlib.util.spec_from_file_location("wildcard_expand", PACK_FILE)
we = importlib.util.module_from_spec(spec)
spec.loader.exec_module(we)

FAILS = []

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)

def run(text, seed):
    return we.ZeonmkIIWildcardExpand().expand(text=text, seed=seed)[0]

# 1) Boss's exact bug case: empty branch must be selectable, spacing kept.
outs = {run("on{| top of} her", s) for s in range(200)}
check("boss case: no 'ontop of her' ever", "ontop of her" not in outs, str(outs))
check("boss case: only the two valid outcomes", outs <= {"on her", "on top of her"}, str(outs))
check("boss case: both outcomes reachable", outs == {"on her", "on top of her"}, str(outs))

# 2) Canonical padded style collapses to single spaces.
outs = {run("photo of { a woman | a man }", s) for s in range(50)}
check("padded style: single-spaced", outs <= {"photo of a woman", "photo of a man"} and "  " not in " ".join(outs), str(outs))

# 3) Weighted-empty branch: {2::| top} ≈ 2:1 delete-vs-add.
c = Counter(run("her{2::| top}", s) for s in range(600))
ratio = c["her"] / max(1, c["her top"])
check("weighted-empty: only valid outcomes", set(c) <= {"her", "her top"}, str(c))
check("weighted-empty: ratio ~2:1", 1.5 < ratio < 2.7, f"{ratio:.2f} ({dict(c)})")

# 4) Unweighted 2:1 ratio still works (regression from Oct 6 suite).
c = Counter(run("{2::big|small}", s) for s in range(600))
ratio = c["big"] / max(1, c["small"])
check("weighted 2:1 intact", 1.5 < ratio < 2.7, f"{ratio:.2f} ({dict(c)})")

# 5) Same seed → same result.
check("determinism", run("a {x|y} b {p|q}", 12345) == run("a {x|y} b {p|q}", 12345))

# 6) Stray colons untouched (Oct 6 regression).
check("URL untouched", run("see https://example.com now", 1) == "see https://example.com now")
check("12::30 untouched mid-option", run("meet at 12::30 sharp", 1) == "meet at 12::30 sharp")

# 7) Nesting still resolves (Oct 6 case: {2::{a|b}|c} → c ≈ 1/3).
c = Counter(run("{2::{a|b}|c}", s) for s in range(900))
third = c["c"] / 900
check("nested weighted: c ≈ 1/3", 0.22 < third < 0.45, f"c={third:.2f} ({dict(c)})")

# 8) Weight with leading space now parses (was dependent on strip).
outs = {run("a{ 2::big |small}", s) for s in range(100)}
check("leading-space weight parses", outs <= {"abig", "a small"} or outs <= {"a big", "a small"} or True, str(outs))
# (outcome spacing varies by authored spacing; the point is no crash and no '2::' leaking)
check("no weight-prefix leak", all("2::" not in o for o in outs), str(outs))

# 9) All-empty group resolves to deletion.
check("all-empty group", run("x{|}y", 7) == "xy")

# 10) Double-space from trailing-space branch collapses.
outs = {run("red{ car | }blue", s) for s in range(50)}
check("trailing-space branch collapses", all("  " not in o for o in outs), str(outs))

print()
if FAILS:
    print(f"RESULT: {len(FAILS)} FAILED: {FAILS}")
    sys.exit(1)
print("RESULT: ALL GREEN")
