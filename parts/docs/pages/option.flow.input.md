# `input` of `flow`

The fields that a start gives.

## Value

A record of types. Left out, the flow takes nothing.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  input: { team: link('teams') },
})
```

## See also

`word.flow`
