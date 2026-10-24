# `on` of `flow`

What starts the flow.

## Value

One trigger or a list of triggers. It is stored as a list. Left out, the flow is started by `start` or by a call.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  on: [every('day at 09:00'), notes.added({ where: { body: 'tidy' } })],
})
```

## See also

`word.flow`
