# `system` of `query`

Gives the query full access, with the reason.

## Value

Text that says why the query needs every row: it is read by whoever reads the code, and `tent access` shows it. Left out, the query reads as its caller.

Full access means that the rules of the tables do not hold: the query reaches every row, whatever `access` of a table says. How it is used depends on how the query is written:

- Written in our own words, with `rows`, the whole plan or write is carried out with full access.
- Written with `run`, full access is `db.system`, and `db` beside it stays limited to the caller. So one `run` reads what the caller may see through `db`, and what it must see beyond that through `db.system`.

`db.system` in a query that states no `system` is `code.T3004`. The rule of the query itself, its `access`, holds either way: it says who may call, and `system` only what the call may reach.

## Example

```ts
export const ordersOfTheDay = query('ordersOfTheDay', {
  access: role('staff'),
  system: 'the staff see the orders of every customer',
  rows: orders.where({ status: 'open' }).with('customer').newest('placedAt').limit(50),
})

export const myShare = query('myShare', {
  access: 'signedIn',
  system: 'counts every order to say which share is the caller\'s',
  output: number(),
  run: ({ db }) => db.orders.count() / Math.max(1, db.system.orders.count()),
})
```

## See also

`word.query`, `topic.db`, `code.T3004`
