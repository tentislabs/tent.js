# T2029 index-advised

A query passed its slow bar, and its plan reads a whole table: an index would read it by the columns it asks for. A note.

## Details

When a query takes longer than its slow bar, the engine asks the database's own plan of each read of it, once a version. Where a read goes through every row of a table that it filters or orders by, the log holds this note with the exact entry to add, as `indexes: [['status', 'placedAt']]`: the columns the read holds to one value, then a range, then its order. The note names the file of the table, and its line where the bundle lies in the project it was built from, as one of `tent dev` does. `tent check` writes the same note, at the file and the line of the table, from the running app or, with none running, from the log of the data folder; a table that holds the index by then is left out.

The engine adds no index by itself: an index costs every write of its table, so it is yours to add.

## The fix

Add the entry the note names to `indexes` of the table, and publish the version. Or leave it, where the query is rare and the writes many.

## See also

`option.table.indexes`, `command.check`, `command.logs`
