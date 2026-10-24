# T5111 event-two-shapes

A warning. One event name is emitted with data of two shapes, and no declaration of the event says which: a flow that listens to it, or a run that waits for it, is handed data it may not expect.

## Details

The check reads each `emit('name', { ... })` of the backend files whose data is written in place, and holds the names of its fields against those of the first emit of that name. An emit whose data is spread or worked out is not read. An event that a file declares with `event('name', { data })` is passed over: the type checker holds each emit of it to its declaration.

## The fix

Emit the event with one shape. Or declare it, and emit it by its declaration:

```ts
export const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })

emit(orderShipped, { order: input.order, carrier: input.carrier })
```

## See also

`word.event`, `word.emit`, `topic.flows`
