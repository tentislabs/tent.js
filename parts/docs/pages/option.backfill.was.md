# `was` of `backfill`

The old name of the backfill, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const splitNames = backfill('splitNames', {
  table: users,
  run: (row, { db }) => {
    db.users.change(row.id, { first: row.fullName.split(' ')[0] })
  },
  was: 'firstNames',
})
```

## See also

`word.backfill`
