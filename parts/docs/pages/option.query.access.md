# `access` of `query`

Who may call the query.

## Value

A rule. It is required: there is no default.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
})
```

## See also

`word.query`
