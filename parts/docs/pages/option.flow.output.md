# `output` of `flow`

The type of the answer of the flow.

## Value

A type. The answer is checked against it and filtered through it. Left out, a call is typed by what `run` returns.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  output: object({ team: text() }),
})
```

## See also

`word.flow`
