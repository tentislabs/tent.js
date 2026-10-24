# `deprecated` of `query`

Marks the query as going away, in the API description and in its answers.

## Value

A day, as `'2027-01-01'`. Left out, the query stays.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  deprecated: '2027-01-01',
})
```

## See also

`word.query`
