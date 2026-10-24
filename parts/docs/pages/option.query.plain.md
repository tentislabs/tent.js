# `plain` of `query`

Holds the query to the plain form.

## Value

`true`. What would make it code is then an error on that line. Left out, its `run` may be code.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  plain: true,
})
```

## See also

`word.query`
