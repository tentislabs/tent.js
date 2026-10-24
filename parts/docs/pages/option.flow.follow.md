# `follow` of `flow`

Who may follow the runs of the flow from a page.

## Value

A rule, in the form of `access`. Left out, nobody.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  follow: 'signedIn',
})
```

## See also

`word.flow`
