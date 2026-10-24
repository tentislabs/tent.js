import os
import time


def run(input, tent):
    with open(os.path.join(tent.disk, "hog.pid"), "w") as f:
        f.write(str(os.getpid()))
    # All at once, with no pause: the watch is to end the program all the same.
    held = [bytearray(10 * 1024 * 1024) for _ in range(int(input["mb"]) // 10)]
    time.sleep(4)
    return len(held) * 10
