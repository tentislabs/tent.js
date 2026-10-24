# T4004 live-without-limit

A query that is live is written with `rows`, and its plan states no limit. A page that watches it is sent every row of the table, and again whenever one of them changes.

## Details

A plan that answers one row, a count or groups is bounded by what it is, and needs no limit.

## The fix

State a `limit`: `orders.where({ status: 'open' }).limit(50)`. Or state `live: false`, which makes the query one that is asked once.

## See also

`option.query.live`, `option.query.rows`, `topic.check`
