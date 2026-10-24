# `rows` of `query`

The plan that the query answers.

## Value

A plan, made from a table. One of `rows` and `run` is required.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
})
```

## See also

`word.query`
