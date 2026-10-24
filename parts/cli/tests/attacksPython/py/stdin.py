import sys


def run(input, tent):
    line = sys.stdin.readline()
    return "the input is closed" if line == "" else f"read {line}"
