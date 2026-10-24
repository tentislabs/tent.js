# `count`

What `group` takes for the number of rows of each group, and, in the `from` of a column, the count of the rows that link to its row, which the engine keeps.

## Example

```ts
rows: orders.group('status', { n: count() })
```

```ts
openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) })
```

## Options

| Option | Means |
|---|---|
| `option.count.by` | In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the count. |
| `option.count.column` | A column of the counted rows, which a kept `count` takes and does not read: it counts the linked rows themselves, where `sum`, `min` and `max` read a column. |
| `option.count.of` | In the `from` of a column that the engine keeps, the table whose rows the count is worked out of. |
| `option.count.where` | In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the count. |

## Returns

The record `{ count: true }`.

In the `from` of a column, `count({ of, by, where })` makes it a column that the engine keeps: the count of the rows of `of` whose link column `by` points at the row, and that `where` names, a filter as a record. The engine moves the number inside the very write that adds, changes or removes such a row, a raw write among them, so it is never late and never drifts, and fills it first by the one walk of the switch that adds the column, a page to a write. No code writes it (`code.T2107`); it may be filtered, sorted and indexed like any column. It is a fact of the row that holds it, read under that row's rule: it counts every linked row, also those the reader may not read, so a builder who must hide it states `read` on the column, as `read: role('staff')`, as on any column. The rows it counts lie in the same data file as its row (`code.T2025`). The column is a `number`, a whole number from 0.

## Errors

`code.T1014`: the column that keeps the count is no `number`.

`code.T2025`: the counted rows lie in another data file than the row that holds the count.

## See also

`word.table`
