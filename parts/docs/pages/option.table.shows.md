# `shows` of `table`

Makes the table one of the engine's own tables, under the builder's name and read rule: what was counted, or the ratings and scores of runs. The same rows, and no copy.

## Value

`'counts'` or `'scores'`. Such a table states no columns, since they are those of the counts, no `owner`, and no rule but `read`, which it must state. A project holds one such table at most. Left out, the table is the builder's own.

Its columns are `id`, `createdAt` and `updatedAt`; `day`, the start of the day in `project.zone`; `name` and `answeredBy`; `caller`; `user`, a link to `users` where the project has that table; `unit`; and `amount`. With `read: 'owner'` a user reads the rows of their own use and of a key made for them, a visitor the rows of their visitor id, and a caller who has neither nothing.

With `'scores'` the table is the engine's own table of the ratings that people gave the runs of agents and the scores that a judge gave them (`option.agent.score`): `id`, `createdAt` and `updatedAt`; `run` and `agent`; `kind`, `'rating'` or `'score'`; `score`, a number; `note`, a person's words, and `why`, a judge's reason; `caller`, who gave it, the system for a score; and `user`, the person whose run it is. With `read: 'owner'` each person reads the ratings and scores of their own runs.

It is read as any table is: a filter, a sort, `limit`, `after`, `get`, `count`, `group` with its sums, `with('user')`, and a live query over it is sent the new rows when the counts are written. A write of it, `search`, `near`, `history` and a trigger on it are `code.T2016`.

## Example

```ts
export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })

export const myUse = query('myUse', {
  access: 'signedIn',
  input: { from: date() },
  rows: usage.where({ day: { atLeast: input('from') } }).group('unit', { amount: sum('amount') }).limit(50),
})
```

## See also

`word.table`, `option.project.countBy`, `code.T2016`
