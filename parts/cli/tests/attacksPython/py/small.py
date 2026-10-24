import time


def run(input, tent):
    held = bytearray(10 * 1024 * 1024)
    time.sleep(2.5)
    return len(held) // (1024 * 1024)
