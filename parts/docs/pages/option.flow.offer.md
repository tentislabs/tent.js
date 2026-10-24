# `offer` of `flow`

The outside doors the flow is offered to.

## Value

A list of `'api'`, `'mcp'` and `'cli'`. Left out, it is offered to none.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  offer: ['api'],
})
```

## See also

`word.flow`
