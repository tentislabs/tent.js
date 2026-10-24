# `plain` of `flow`

Holds the flow to the plain form.

## Value

`true`. What would make it code is then an error on that line. Left out, its `run` may be code.

A plain `run` reads each word by the name it is imported under, so a word may be imported under another. A flow that an event starts is handed `event`, which hides the word `event` that a wait for a second event needs: imported as `eventNamed`, the body stays plain, as the second example shows. Taken apart under other names, `({ event: shipped, step })`, the arrow is code.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  plain: true,
})
```

```ts
import { event as eventNamed, flow } from 'tentjs'

export const deliveryWatch = flow('deliveryWatch', {
  on: eventNamed('order.shipped'),
  run: async ({ event, step }) => {
    const delivered = await step.waitFor(eventNamed('order.delivered'), { where: { order: event.data.order }, timeout: '10 days' })
    if (delivered.timedOut) await step('ticket', () => openTicket({ order: event.data.order }))
  },
})
```

## See also

`word.flow`
