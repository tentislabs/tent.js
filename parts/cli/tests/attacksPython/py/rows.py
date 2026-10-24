def run(input, tent):
    db = tent.db()
    names = [row[0] for row in db.execute("select name from sqlite_master where type = 'table' order by name")]
    tables = {}
    for name in names:
        cursor = db.execute(f'select * from "{name}" order by rowid')
        columns = [one[0] for one in cursor.description]
        tables[name] = {"columns": sorted(columns), "rows": [dict(zip(columns, row)) for row in cursor.fetchall()]}
    try:
        db.execute("insert into orders (id) values ('x')")
        wrote = True
    except Exception:
        wrote = False
    return {"tables": tables, "wrote": wrote}
