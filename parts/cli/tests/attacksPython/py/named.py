import os


def run(input, tent):
    path = input["f"]
    with open(path) as f:
        text = f.read()
    return {
        "name": os.path.basename(path),
        "dir": os.path.normcase(os.path.realpath(os.path.dirname(path))),
        "folder": os.path.normcase(os.path.realpath(tent.folder)),
        "text": text,
        "above": os.path.exists(os.path.join(tent.folder, "..", "..", "x")),
    }
