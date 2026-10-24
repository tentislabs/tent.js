def run(input, tent):
    if input["what"] == "unknown":
        return tent.call("rowsAll", {"customer": input["customer"]})
    if input["what"] == "refused":
        return tent.call("staffOnly", {})
    name = tent.call("customerName", {"id": input["customer"]})
    note = tent.call("addNote", {"body": "from Python"})
    try:
        tent.call("staffOnly", {})
        refused = None
    except tent.Error as error:
        refused = {"code": error.code, "message": error.message}
    return {"name": name["name"], "note": note["body"], "refused": refused}
