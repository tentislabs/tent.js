# `as` of `flow`

Whose rights a run has.

## Value

`'system'` or `'starter'`. `'system'` when left out: the run has full access.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  as: 'starter',
})
```

## See also

`word.flow`
