# `limits` of `flow`

The limits of a run.

## Value

`{ steps, time, result, wait, pass, stepTime }`. Left out: 1,000 steps, 30 days of work, 1 MB for a result, a wait of 1 year, 5 seconds between two steps.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  limits: { steps: 1000, time: '30 days', result: '1 MB', wait: '1 year', pass: '5 seconds', stepTime: '10 minutes' },
})
```

## See also

`word.flow`
