import os
import time


def run(input, tent):
    began = time.time()
    time.sleep(input["seconds"])
    return {"pid": os.getpid(), "began": began, "ended": time.time()}
