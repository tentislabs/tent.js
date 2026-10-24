def run(input, tent):
    with open(tent.file(input["id"]), "rb") as f:
        return f.read().decode()
