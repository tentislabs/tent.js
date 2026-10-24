# `about` of `action`

One sentence on what the action is for.

## Value

Text. Left out, the action has no sentence.

What it holds is told to everyone a tool is shown to: the model of every starter alike, the list of MCP, and the docs of the API. So it holds nothing secret.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  about: 'Sends a note',
})
```

## See also

`word.action`
