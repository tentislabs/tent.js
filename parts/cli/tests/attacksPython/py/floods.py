import os
import struct
import time


def run(input, tent):
    with open(os.path.join(tent.disk, "floods.pid"), "w") as f:
        f.write(str(os.getpid()))
    if input["how"] == "header":
        # The head of a frame of a gigabyte, written to the channel itself, and the start of its body.
        os.write(4, struct.pack("<I", 1024 * 1024 * 1024))
        os.write(4, b"x" * 65536)
        time.sleep(10)
        return "the frame was not refused"
    # An answer larger than a frame may hold.
    return "x" * (17 * 1024 * 1024)
