# `fills` of `backfill`

The column that the backfill fills, which the same version may make required that the version before left optional.

## Value

The name of a column of its table. Left out, the backfill fills no column it names. The check that refuses a column made required while rows hold nothing in it is held after the backfill ran, not before: the version that makes it required and fills it is taken in one switch.

## Example

```ts
// users.first was optional, and is `text()` in this version.
export const splitNames = backfill('splitNames', {
  table: users,
  fills: 'first',
  run: (row, { db }) => db.users.change(row.id, { first: row.fullName.split(' ')[0] }),
})
```

## Errors

`code.T2001`: a row still holds nothing in the column once the backfill ran.

## See also

`word.backfill`, `code.T2001`
