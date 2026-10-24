# `min`

The smallest of the numbers, the days or the moments of a list, or of one field of each entry.

## Example

```ts
const first = min(rows, 'placedAt')
```

```ts
least: number({ from: min({ of: orders, by: 'customer', column: 'total' }) })
```

## Options

| Option | Means |
|---|---|
| `option.min.by` | In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the least. |
| `option.min.column` | In the `from` of a column that the engine keeps, the column of the counted rows whose least is kept. |
| `option.min.of` | In the `from` of a column that the engine keeps, the table whose rows the least is worked out of. |
| `option.min.where` | In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the least. |

## Returns

The smallest, in its kind, and nothing for an empty list. Handed one text and nothing else, it answers what `group` takes for a column. Handed a reference it answers its record.

In the `from` of a column, `min({ of, by, where, column })` makes it a column that the engine keeps: the least of `column` of the rows of `of` whose link column `by` points at the row, and that `where` names, a filter as a record. The engine moves the number inside the very write that adds, changes or removes such a row, a raw write among them, so it is never late and never drifts, and fills it first by the one walk of the switch that adds the column, a page to a write. No code writes it (`code.T2107`); it may be filtered, sorted and indexed like any column. It is a fact of the row that holds it, read under that row's rule: it counts every linked row, also those the reader may not read, so a builder who must hide it states `read` on the column, as `read: role('staff')`, as on any column. The rows it counts lie in the same data file as its row (`code.T2025`). The column is of the kind of `column`, as `date({ from: min({ of: orders, by: 'customer', column: 'placedAt' }) })`, and holds nothing while no row is counted.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

`code.T1014`: in a `from`, the column is of another kind than `column`, or no `column` is named.

`code.T2025`: in a `from`, the counted rows lie in another data file than the row that holds the number.

## See also

`topic.values`, `word.max`, `word.least`
