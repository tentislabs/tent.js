# `system` of `flow`

The reason why an offered flow has full access.

## Value

Text that says why. Left out, an offered flow states `as: 'starter'`.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  system: 'tidies for every team',
})
```

## See also

`word.flow`
