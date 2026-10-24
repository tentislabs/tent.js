# `system` of `backfill`

The reason the backfill has full access: its `db` then has `db.system`, `db.sql` and `db.n`.

## Value

Text that says why. Left out, the `db` of the backfill is that of the system with no `system`, `sql` or `n`.

## Example

```ts
export const recount = backfill('recount', {
  table: orders,
  system: 'it reads the raw totals of the old layout',
  run: (row, { db }) => {
    const [held] = db.sql('SELECT "total" FROM "orders" WHERE "id" = ?', [row.id])
    db.orders.change(row.id, { cents: Math.round(Number(Object(held).total) * 100) })
  },
})
```

## See also

`word.backfill`
