def run(input, tent):
    # Each call is let out of run, so the error that reaches the caller is the one the engine raised for it.
    if input["what"] == "unknown":
        return tent.call("rowsOf", {"customer": input["customer"]})
    return tent.call("staffOnly", {})
