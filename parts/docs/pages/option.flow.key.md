# `key` of `flow`

What a run of the flow is about, such as the order it ships: a start of the same key can join the run under way, an event can stop it, and `runs.find` finds it.

## Value

An arrow that is handed `{ input, event }`, as `run` is handed them, and answers the key: text, or a number, which is kept as its text. Left out, the key of a run that a table trigger started is the id of the row, and a run of any other start has none.

## Example

```ts
export const ship = flow('ship', {
  input: { order: text() },
  key: ({ input }) => input.order,
  together: { then: 'join' },
  run: async ({ input, step }) => {
    await step('pack', () => packOrder({ order: input.order }))
  },
})
```

A run keeps its key as `key` of what `runs.read` answers, and `runs.find({ flow: 'ship', key: order })` answers the runs of one order.

## Errors

`code.T1014`: `key` is no arrow.

## See also

`option.flow.together`, `option.flow.stopOn`, `handle.runs`, `word.flow`
