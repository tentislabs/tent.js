# `table`

A table of the app: its columns, whose rows they are, and who may read and write them.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
})
```

## Options

| Option | Means |
|---|---|
| `option.table.columns` | The columns of the table, each a type by its name. |
| `option.table.owner` | The column that says whose row it is. |
| `option.table.access` | Who may read, add, change and remove rows. |
| `option.table.search` | The columns that text search covers. |
| `option.table.indexes` | Indexes over several columns. |
| `option.table.unique` | Sets of columns whose values together may stand once. |
| `option.table.keepHistory` | Whether old versions of rows are kept. |
| `option.table.removed` | The columns that were removed on purpose. |
| `option.table.tenant` | The link column that says whose data file a row lives in. |
| `option.table.shows` | Makes the table the engine's own table of what was counted, under the builder's name and read rule. |
| `option.table.plain` | Holds the table to the plain form. |
| `option.table.was` | The old name of the table, where it was renamed. |
| `option.table.kept` | Keeps its rows in the writer's memory alone. |
| `option.table.lasts` | How long a row lasts after its last write, or after a moment of its own: past it, the row is removed. |

## Returns

A table that states `tenant` gives `of(tenant)` first: every plan and every write of it starts there, as `orders.of(input('team')).where({ status: 'open' })`.

The definition, with the plans that start at a table (`where`, `get`, `search`, `near`, `count`, `group`, `history`, and every member of a plan), the writes (`add`, `change`, `remove`) and the triggers (`added`, `changed`, `removed`). Each answers plain data, and nothing is carried out.

## See also

`topic.words`
