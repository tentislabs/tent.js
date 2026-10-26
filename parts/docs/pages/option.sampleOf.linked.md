# `linked` of `sampleOf`

What makes a row for a link, and answers its id.

## Value

A function of the name of a table that answers a promise of the id of a row of it: a sample of a link is that promise. Left out, a link has no sample, and `sampleOf` throws.

## Example

```ts
const order = await sampleOf({ kind: 'link', table: 'orders' }, 'order', {
  linked: async (table) => String((await app.make(table, 1))[0].id),
})
```

## Errors

`code.T0002`: a link with no `linked`.

## See also

`word.sampleOf`, `word.testApp`
