# `run` of `backfill`

What the backfill does with one row. Required.

## Value

A function, handed the row as code sees it and `{ db, now }`: `db` is the `db` of a change, as the system, and `now` the moment of its write. What it answers is not kept. Every row of a page is handed in one write; a write that fails is undone whole, and is tried again where the backfill stood.

## Example

```ts
export const stamp = backfill('stamp', {
  table: tasks,
  run: (row, { db }) => {
    db.tasks.of(row.team).change(row.id, { checked: true })
  },
})
```

## See also

`word.backfill`, `topic.db`
