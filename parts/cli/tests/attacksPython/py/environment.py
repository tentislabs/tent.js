import os


def run(input, tent):
    return {"names": sorted(os.environ), "values": sorted(os.environ.values())}
