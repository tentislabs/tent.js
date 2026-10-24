# `heavy` of `query`

Runs the query on a query thread.

## Value

True or false. False when left out.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  heavy: true,
})
```

## See also

`word.query`
