# T4001 clock-in-query

The code of a query reads a clock: `Date.now()`, `new Date()` with nothing handed to it, or `performance.now()`. A query answers the same for the same data, which is what lets a page watch it and a reader on another machine answer it.

## The fix

Read `now`, which `run` is handed: it is one moment for the whole of the query. In a query written with our words, `now()` is that same moment.

## See also

`word.now`, `code.T4002`, `topic.check`
