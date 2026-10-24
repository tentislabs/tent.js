# `start`

Starts a run of a flow or of an agent and does not wait for it. In a change the start is part of the same write: where the change fails, no run is left.

## Example

```ts
import { change, input, start, text } from 'tentjs'
import { bigOrder } from './flows.ts'

export const placeOrder = change('placeOrder', {
  access: 'signedIn',
  input: { order: text() },
  run: ({ input }) => {
    const { run } = start(bigOrder, { order: input.order })
    return run
  },
})
```

## Returns

`{ run }`, with the id of the run. Inside a step of a flow, a step that runs a second time finds the same run, and starts no second one.

A flow that is called by its own name, `await bigOrder(input)`, starts a run too, waits for it, and answers the answer of the flow: `topic.flows` says where that is allowed.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

`code.T0013`: it was used in a query, which starts nothing.

`code.T0002`: what the flow was given does not fit its `input`.

`code.T5001`: it was used in a flow outside a step.

`code.T7103`: the flow states `together: { then: 'refuse' }`, and as many of its runs work as may work at once.

## See also

`word.flow`, `topic.flows`, `handle.runs`
