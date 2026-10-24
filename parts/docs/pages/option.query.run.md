# `run` of `query`

The function that answers the query.

## Value

An ordinary function, not an async one, that is handed `{ input, db, user, now }` and reads through `db` alone. One of `rows` and `run` is required.

Where the query states no `output`, its `run` answers rows as `db` handed them, or a number. Any other answer - a record that the `run` made, a list of its own records - is `code.T0009` while it runs, and the page that read it is the error screen: a query that answers a record of its own states its `output`, which its answer is held to.

## Example

```ts
export const orderCounts = query('orderCounts', {
  access: 'signedIn',
  output: object({ open: number(), paid: number() }),
  run: ({ db }) => ({ open: db.orders.count({ status: 'open' }), paid: db.orders.count({ status: 'paid' }) }),
})
```

## Errors

`code.T7009`: the check finds a `run` with no `output` that answers a record of its own, or a list of them, before anything runs.

`code.T0009`: a `run` with no `output` that answers what is neither rows nor a number.

## See also

`word.query`, `option.query.output`, `topic.db`
