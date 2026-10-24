# T2030 heavy-on-memory

A query that states `heavy` reads a table kept in memory: it runs on the writer's main thread all the same. A note.

## Details

The rows of a table that states `kept: 'memory'` live in the memory of the writer's main thread alone (`option.table.kept`). A query that reads them runs there, where its rows are, whatever it states: `heavy`, which would move a query to a thread of its own, moves nothing. The check notes it at the query, so the word does not promise what it does not do.

## The fix

Take `heavy` out of the query. A query of a table kept in memory is read from memory, and is quick.

## See also

`option.table.kept`, `word.query`
