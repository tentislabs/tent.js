# `emit`

Sends an event, as part of the write of the change it is called in. Each flow whose trigger is `event` of that name is started, and each run that waits for it with `step.waitFor` goes on, inside the same write: where the change fails, nothing was sent.

## Example

```ts
import { change, emit, event, object, text } from 'tentjs'

export const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })

export const ship = change('ship', {
  access: 'signedIn',
  input: { order: text(), carrier: text() },
  run: ({ input }) => {
    emit(orderShipped, { order: input.order, carrier: input.carrier })
  },
})
```

## Returns

Nothing. The data of the event is plain data, and a flow is handed it as `event.data`.

An event may be emitted by its name, `emit('order.shipped', data)`, or by its declaration (`word.event`). The data of a declared event is held to its type: by the type checker before, by its name too, since the build lists each declared event in `tent.d.ts`, and while running, where data that does not fit is `code.T0002` and nothing is sent. An event that no file declares is sent with its data as it is.

## Errors

`code.T0002`: the data of a declared event does not fit its type. The field that does not fit is named.

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

`code.T0013`: it was used outside a change.

## See also

`word.event`, `code.T5111`, `topic.flows`
