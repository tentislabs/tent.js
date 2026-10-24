# `about` of `change`

One sentence on what the change is for.

## Value

Text. Left out, the change has no sentence.

What it holds is told to everyone a tool is shown to: the model of every starter alike, the list of MCP, and the docs of the API. So it holds nothing secret.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  about: 'Adds a note',
})
```

## See also

`word.change`
