import time


def run(input, tent):
    held = []
    for _ in range(int(input["mb"])):
        held.append(bytearray(1024 * 1024))
    # The watch reads the memory once a second: the call stays long enough to be read.
    time.sleep(2.5)
    return len(held)
