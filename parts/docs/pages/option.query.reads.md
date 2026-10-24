# `reads` of `query`

The tables that a raw SQL read of the query reads.

## Value

A list of tables. Left out, they are worked out where the query is plain.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  reads: [notes],
})
```

## See also

`word.query`
