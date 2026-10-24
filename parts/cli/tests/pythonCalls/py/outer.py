import os


def run(input, tent):
    return f"outer in {os.getpid()}, {tent.call('inner', {})}"
