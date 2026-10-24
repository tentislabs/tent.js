# `refresh` of `query`

How often the query is asked again, for results that depend on the time.

## Value

A length of time, as `'1 minute'`. Left out, it is asked again only when its rows change.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  refresh: '1 minute',
})
```

## See also

`word.query`
