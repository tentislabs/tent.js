# T2108 too-many-rows

One read of a live query answered more rows than `liveRows`, which is 10,000 where the project says nothing.

## Details

A live query is run again whenever a table it read is written, for everyone who watches it, so one read of it is bounded. The read fails with one row more than the bound. A count is no row, and a query that is not live has no bound of rows.

## The fix

State a `limit` on the plan, and read further pages with `after`. A query that must answer everything states `live: false`.

## See also

`code.T0008`, `word.query`
