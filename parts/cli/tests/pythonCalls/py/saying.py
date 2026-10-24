import time


def run(input, tent):
    # What the work says reaches whoever follows its run: each value takes the place of the one before.
    for at in range(1, 4):
        tent.say({"at": at})
        time.sleep(0.2)
    return 3
