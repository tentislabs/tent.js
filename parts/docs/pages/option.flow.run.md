# `run` of `flow`

The function of the flow, which is run from its top on every pass.

## Value

A function that is handed `{ event, input, user, step, db }`. It is required.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
})
```

## See also

`word.flow`
