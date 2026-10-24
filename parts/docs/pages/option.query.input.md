# `input` of `query`

The fields that a call gives.

## Value

A record of types. Left out, the query takes nothing.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  input: { limit: number({ default: 50 }) },
})
```

## See also

`word.query`
