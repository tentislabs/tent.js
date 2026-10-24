def run(entries, tent):
    try:
        tent.db()
        alone = "none"
    except tent.Error as error:
        alone = error.code
    return [{"n": entry.input["n"], "of": len(entries), "alone": alone} for entry in entries]
