import os
import time


def run(input, tent):
    time.sleep(input["seconds"])
    return os.getpid()
