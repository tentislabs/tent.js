# `table` of `backfill`

The table whose rows the backfill is handed, one at a time. Required.

## Value

A table of the app, as its definition: `table: users`. For a tenant table, the backfill walks the rows of every tenant's file.

## Example

```ts
export const splitNames = backfill('splitNames', { table: users, run: (row, { db }) => db.users.change(row.id, { first: row.fullName.split(' ')[0] }) })
```

## See also

`word.backfill`
