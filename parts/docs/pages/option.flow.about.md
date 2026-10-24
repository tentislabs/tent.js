# `about` of `flow`

One sentence on what the flow is for.

## Value

Text. Left out, the flow has no sentence.

What it holds is told to everyone a tool is shown to: the model of every starter alike, the list of MCP, and the docs of the API. So it holds nothing secret.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  about: 'Tidies the notes of a team',
})
```

## See also

`word.flow`
