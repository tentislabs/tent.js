# `danger` of `flow`

Whether the flow, used as a tool, asks a person first.

## Value

`'ask'`. Left out, it asks nobody. As a tool of an agent, a flow that asks makes the run wait for a person's yes before each call: the ask that a page shows of the run (`option.agent.tools`).

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  danger: 'ask',
})
```

## See also

`word.flow`
