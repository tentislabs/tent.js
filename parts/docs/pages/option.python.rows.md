# `rows` of `python`

Plans whose rows reach Python as tables.

## Value

A record of plans by name. Each is carried out as the caller before the call, under the rules of the tables, and with full access where the definition states `system`. Its rows reach Python as a table of that name in a read-only SQLite file, which `tent.db()` opens: a column for each column the plan answers and `id`, with text, a choice, a day, a link and a file as text, a number as a number, true and false as 1 and 0, a date as text in the standard form, and a list, an object or a vector as JSON text. A private column is never there. A plan with `.with('customer')` gives one more table, `<name>_customer`, which holds each linked row once, by the `id` that the link column holds; a plan that answers a number gives one row with the column `value`. The file holds no other table of the app, and is removed when the call ends. Left out, the code is handed no rows, and `tent.db()` raises `tent.Error` with T0013.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  rows: { notes: notes.where({ team: input('team') }) },
})
```

## See also

`word.python`
