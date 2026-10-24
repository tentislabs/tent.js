# `about` of `query`

One sentence on what the query is for.

## Value

Text. Left out, the query has no sentence.

What it holds is told to everyone a tool is shown to: the model of every starter alike, the list of MCP, and the docs of the API. So it holds nothing secret.

## Example

```ts
export const openNotes = query('openNotes', {
  access: allow((user) => user !== undefined),
  rows: notes.where({ body: { contains: 'open' } }).limit(input('limit')),
  about: 'The notes that are open',
})
```

## See also

`word.query`
