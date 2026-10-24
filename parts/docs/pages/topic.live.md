# Live data

A page that shows a query follows it: when a change writes a row that the query read, the engine runs the query again and sends the page what changed. Nothing is written for it in a project: a query is live unless it states `live: false`.

## What makes a query run again

The engine notes which tables each run of a watched query read, a table that a rule reads among them. A write that is committed marks every watched query that read one of the tables it touched, and the marked ones are run 5 ms later, so writes that land together cause one run.

| A watched query | Is run again |
|---|---|
| Reads a table with a filter, a sort or a count | When any row of that table is added, changed or removed |
| Reads one row by its id, as `notes.get(input('note'))` | When that row is written, and for no other row of its table |
| States `refresh: '1 minute'` | Also on that timer, for an answer that depends on the time |
| States `heavy: true` | On a query thread, as every run of it |

A raw SQL write names no row. One whose change states `touches: [notes]` runs the queries that read `notes`. One that states no `touches` runs every watched query.

Each run builds the caller again and passes the rule of the query again. So a user who lost a role is told that the query failed at the next run, and the watch is over.

## What a page is sent

When the new answer is the one the page holds, nothing is sent. Otherwise the page is sent what changed, where the answer is a list of rows that each hold their own `id`, or a page `{ rows, next }` of them: the rows that are new, changed or moved, each with the id of the row it stands after, and the ids of the rows that left. Any other answer is sent whole: one row, a number, a list of texts, and a list of which more than half changed.

So a query that answers rows as `db` handed them out costs a page little, however long its list is. A query that builds a record of its own in `run` is sent whole each time it changes.

One read of a live query may answer `liveRows` rows, 10,000 where the project states none. One more fails the query with `code.T2108`: state a `limit`, or `live: false`.

## Who shares a run

Watches of the same query, with the same input, by the same caller, share one run. Two callers are the same when they are the same user, the same key or the same grant of a program. Callers who are nobody are the same. So a hundred visitors on one public screen cost one run for each write.
