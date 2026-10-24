# `query`

A read of the app's data. It is written with `rows`, a plan, or with `run`, a function that reads through `db` alone.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
})
```

## Options

| Option | Means |
|---|---|
| `option.query.access` | Who may call the query. |
| `option.query.rows` | The plan that the query answers. |
| `option.query.run` | The function that answers the query. |
| `option.query.about` | One sentence on what the query is for. |
| `option.query.input` | The fields that a call gives. |
| `option.query.output` | The type of the answer. |
| `option.query.live` | Whether a page that reads the query follows its rows. |
| `option.query.refresh` | How often the query is asked again, for results that depend on the time. |
| `option.query.heavy` | Runs the query on a query thread. |
| `option.query.offer` | The outside doors the query is offered to. |
| `option.query.deprecated` | Marks the query as going away, in the API description and in its answers. |
| `option.query.system` | Gives the query full access, with the reason. |
| `option.query.reads` | The tables that a raw SQL read of the query reads. |
| `option.query.countBy` | For whom the calls of the query are counted. |
| `option.query.plain` | Holds the query to the plain form. |
| `option.query.was` | The old name of the query, where it was renamed. |

## Returns

A function, `openOrders(input)`, which answers at once. A call is handed to the engine.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`
