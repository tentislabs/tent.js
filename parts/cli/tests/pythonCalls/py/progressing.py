import os
import time


def run(input, tent):
    kept = tent.progress()
    if kept is not None:
        return {"handed": kept}
    tent.save_progress({"n": 5})
    if input.get("wait"):
        # The test waits for this file, and kills the engine while the call is under way.
        with open(os.path.join(tent.disk, "saved"), "w") as f:
            f.write("saved")
        time.sleep(60)
    return {"handed": None}
