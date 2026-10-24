# `onFail` of `flow`

What is carried out when a run fails for good.

## Value

A function that is handed what `run` is handed, and `failure`: `{ step, code, message }`. Left out, nothing is done.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  onFail: ({ failure }) => failure.code,
})
```

## See also

`word.flow`
