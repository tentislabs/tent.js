# `search` of `table`

The columns that text search covers.

## Value

A list of text columns, or `{ columns, by }` with `by` as `'words'` or `'pieces'`. Left out, the table is not searched by words.

`by` says what a typed word finds. Each typed word must be found, in any of the columns and in any order, and neither capitals nor the marks of a letter count: `lovelace` finds "Ada Lovelace".

| `by` | A typed word finds |
|---|---|
| `'words'`, where it is left out | A whole word of the text: `lovelace` finds it, `love` finds nothing. For text that is read, as notes and pages |
| `'pieces'` | A typed word of three characters or more anywhere in the text, so `ovel` finds "Lovelace"; a typed word of one or two characters finds the words that start with it, so `la` finds "Lamarr". For what people type into a search box while they look for a name |

The best first is the measure of the search index of SQLite, bm25: a row comes earlier where the typed words stand in it more often, where they are rarer among the rows, and where its text is shorter; every column weighs the same: a word in a title counts as much as a word in the body.

An empty text finds every row (`topic.plans`). A search by meaning is another thing: a `vector` column and `near` (`word.vector`).

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  search: { columns: ['note'], by: 'pieces' },
})
```

## See also

`word.table`, `topic.plans`, `topic.screens`
