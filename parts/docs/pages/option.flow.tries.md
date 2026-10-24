# `tries` of `flow`

How often a step is tried in all.

## Value

A number, or `{ max, wait }` with the first wait as a length of time. 4 when left out.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  tries: { max: 4, wait: '1 minute' },
})
```

## See also

`word.flow`
