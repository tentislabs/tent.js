# T0012 read-only

A write was tried where only a read is allowed.

## Details

Only a change writes. The store is told to write nothing outside a write, so a raw SQL text that adds, changes or removes rows there fails with this code, in a query and in an action alike. A store that was opened to read alone refuses every write. A text that may only read, as `db.sql` of a `db` that only reads runs it, is refused where it writes, also while a write is open. A raw text that the store's guard refuses for what it is, as one that reads what tells of the data file itself, is `code.T0013`.

## The fix

Move the write into a change. An action and a step of a flow call that change.

## See also

`adapter.Store`, `code.T0013`
