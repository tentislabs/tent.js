import os
import time

# A model that takes a while to load, and is loaded once for every call after.
time.sleep(6)
LOADED_IN = os.getpid()


def run(input, tent):
    with open(input["f"], "rb") as f:
        text = f.read().decode()
    made = os.path.join(tent.folder, "answer.txt")
    with open(made, "w") as f:
        f.write("an answer of the worker")
    marker = os.path.join(tent.disk, "kept.txt")
    disk = "there" if os.path.exists(marker) else "new"
    with open(marker, "w") as f:
        f.write("kept")
    return {"pid": LOADED_IN, "made": made, "text": text, "disk": disk}
