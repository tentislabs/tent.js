import os
import tempfile


def run(input, tent):
    where = input["where"]
    if where == "outside":
        path = os.path.join(tempfile.gettempdir(), "made-outside-the-call.txt")
        with open(path, "w") as f:
            f.write("outside")
        return {"made": path}
    if where == "linked":
        target = os.path.join(tempfile.gettempdir(), "linked-outside-the-call.txt")
        with open(target, "w") as f:
            f.write("outside")
        path = os.path.join(tent.folder, "linked.txt")
        try:
            os.symlink(target, path)
        except OSError:
            # The test tells this apart from the refusal of the link, which it holds where a link can be made.
            raise tent.Fail("no-links", "This user may make no link to a file here.")
        return {"made": path}
    path = os.path.join(tent.folder, "made.txt")
    with open(path, "wb") as f:
        f.write(b"x" * (3 * 1024 * 1024) if where == "large" else b"made by Python")
    return {"made": path}
