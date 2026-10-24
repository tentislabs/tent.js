# `access` of `flow`

Who may call the flow through the door.

## Value

A rule. A flow that states it is offered. Left out, the flow is reached from no door.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  access: 'signedIn',
})
```

## See also

`word.flow`
