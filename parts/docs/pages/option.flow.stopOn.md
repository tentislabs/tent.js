# `stopOn` of `flow`

The events that stop the runs of the flow that are about the same thing: a cancel of an order stops the run that ships it, in the very write that sends the event.

## Value

An event with a `key`, or a list of them: `event('order.cancelled', { key: ({ data }) => data.order })`. The key of the event is held against the key of each run of the flow that has not ended (`option.flow.key`), and every run whose key is the same is stopped in the write of the change that calls `emit`. Where that change fails, nothing is stopped. Only the runs in the data file of that write are stopped, so an event of one tenant stops no run of another. Left out, no event stops a run of the flow.

## Example

```ts
export const ship = flow('ship', {
  input: { order: text() },
  key: ({ input }) => input.order,
  stopOn: event('order.cancelled', { key: ({ data }) => data.order }),
  run: async ({ input, step }) => {
    await step('pack', () => packOrder({ order: input.order }))
    await step.wait('2 days')
    await step('send', () => sendOrder({ order: input.order }))
  },
})

export const cancelOrder = change('cancelOrder', {
  access: 'signedIn',
  input: { order: text() },
  run: ({ input }) => {
    emit('order.cancelled', { order: input.order })
  },
})
```

A caller that waits for a stopped run gets `code.T5106`.

## Errors

`code.T1014`: `stopOn` holds what is no event with a key.

## See also

`option.flow.key`, `word.event`, `word.emit`, `word.flow`
