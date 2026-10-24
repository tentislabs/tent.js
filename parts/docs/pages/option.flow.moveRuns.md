# `moveRuns` of `flow`

Whether a waiting run is moved to a new version.

## Value

`'never'` or `'whenSafe'`. `'never'` when left out.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  moveRuns: 'whenSafe',
})
```

## See also

`word.flow`
