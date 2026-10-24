# `offer` of `query`

The outside doors the query is offered to.

## Value

A list of `'api'`, `'mcp'` and `'cli'`. Left out, it is offered to none.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  offer: ['api', 'mcp', 'cli'],
})
```

## See also

`word.query`
