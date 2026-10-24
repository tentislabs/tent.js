# `page` of `backfill`

How many rows one write of the backfill takes.

## Value

A whole number over 0. Left out, `limits.workPage` (1,000). Each page is one write, with the place of the backfill in it, so a stop loses at most the page that was under way, which is then done again.

## Example

```ts
export const splitNames = backfill('splitNames', { table: users, page: 200, run: (row, { db }) => db.users.change(row.id, { first: row.fullName.split(' ')[0] }) })
```

## Errors

`code.T1014`: a value that is no whole number over 0.

## See also

`word.backfill`, `option.project.limits`
