# `live` of `query`

Whether a page that reads the query follows its rows.

## Value

True or false. True when left out; false makes it one-shot.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  live: false,
})
```

## See also

`word.query`
