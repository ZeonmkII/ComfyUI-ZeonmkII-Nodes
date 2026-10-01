"""
ZeonmkII Run Timer — a stopwatch for the whole workflow.

Frontend-only node (never runs in Python): the JS side (js/run_timer.js)
listens to ComfyUI's run events — resets to zero the moment a run begins,
counts up live while the workflow works, freezes on the total when it
finishes. Red on error, green flash on success.

OUTPUT_NODE is intentionally NOT set, so ComfyUI skips this node on every
Run: no inputs to wire, no outputs to chain, nothing in the prompt. Drop it
anywhere on the canvas and it times whatever you run.
"""


class ZeonmkIIRunTimer:
    DESCRIPTION = (
        "A stopwatch for the whole workflow. Resets to zero when you press "
        "Run, counts up live while the workflow is working, freezes on the "
        "total time the moment it finishes (green), and stops red if a run "
        "errors out. Drop it anywhere — it never needs to be wired into the "
        "graph, and it never runs in Python."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "ZeonmkII"

    def noop(self):
        return ()
