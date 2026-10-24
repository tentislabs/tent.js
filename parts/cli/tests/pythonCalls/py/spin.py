import time


def run(input, tent):
    # Does as much work as the processor time of the program it is told: on a busy computer that takes longer.
    end = time.process_time() + input["seconds"]
    while time.process_time() < end:
        pass
    return 1
