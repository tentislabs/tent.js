import time

# A package that takes long to load, as a model does.
time.sleep(3)


def run(input, tent):
    return "loaded"
