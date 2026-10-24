import os


def run(input, tent):
    seen = {name: [type(value).__name__, value] for name, value in input.items() if name != "f"}
    path = input["f"]
    with open(path, "rb") as f:
        text = f.read().decode()
    seen["f"] = {
        "name": os.path.basename(path),
        "text": text,
        "inFolder": os.path.dirname(os.path.realpath(path)) == os.path.realpath(tent.folder),
    }
    return seen
