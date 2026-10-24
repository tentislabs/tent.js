# `countBy` of `flow`

For whom the runs of the flow are counted.

## Value

`'caller'` or `'limits'`. Left out, the project's `countBy` holds.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  countBy: 'limits',
})
```

## See also

`word.flow`
