def run(input, tent):
    return {"rows": tent.db().execute("select count(*) from notes").fetchone()[0]}
