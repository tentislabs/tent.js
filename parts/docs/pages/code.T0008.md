# T0008 took-too-long

A time limit of the engine was passed. A caller gets it with the status 500.

## Details

A `db` may be used for as long as its definition may take: `queryTime` for a query, 1 second where the project says nothing, and `changeTime` for a change, 5 seconds. Past it the next call of `db` fails with this code. A query cannot be stopped in the middle of a read, so it is its next read that fails. A change is undone.

## The fix

Read less in one call: state a `limit`, or an index for what the filter names. Mark a query that must read much `heavy: true`. Where the work truly needs longer, raise the limit in `project.limits`.

## See also

`code.T2108`, `topic.errors`
