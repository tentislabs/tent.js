import os
import subprocess
import sys
import time

# The program that the Python code starts says its own number, so a launcher between the two changes nothing.
# It ends by itself after a while, so that a run in which it is left behind is not held up for long.
CHILD = "import os, sys, time\nopen(sys.argv[1], 'w').write(str(os.getpid()))\ntime.sleep(40)\n"


def run(input, tent):
    how = input["how"]
    said = os.path.join(tent.disk, f"child-{how}")
    subprocess.Popen([sys.executable, "-I", "-c", CHILD, said])
    for _ in range(100):
        if os.path.exists(said) and open(said).read():
            break
        time.sleep(0.05)
    # The test looks at the program this one started while this one still runs, and then says go.
    go = os.path.join(tent.disk, f"go-{how}")
    for _ in range(1200):
        if os.path.exists(go):
            break
        time.sleep(0.05)
    if how == "exit":
        os._exit(3)
    if how == "memory":
        held = [bytearray(10 * 1024 * 1024) for _ in range(30)]
        time.sleep(5)
        return len(held)
    time.sleep(10)
    return 0
