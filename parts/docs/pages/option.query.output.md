# `output` of `query`

The type of the answer.

## Value

A type. It is required when `run` answers anything but rows as `db` handed them, or a number. Left out, the answer is not filtered through a type.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  output: number(),
})
```

## See also

`word.query`
