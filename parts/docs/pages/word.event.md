# `event`

A trigger that fires when a change emits an event of that name, or when the engine raises one of its own, as `run.failed`. A wait takes it too, and `stopOn` of a flow takes it with a key. Another of the engine's own is `page.stale`, handed `{ addresses, keys?, all?, why }` within a second of a write that made public answers of screens stale (`option.project.cache`), and `{ all: true, why: 'version' }` at a switch, so a flow asks a cache outside the engine to drop them, with the tries of any flow. A program that holds the engine hears it by `engine.on('page.stale', ...)`.

## Example

```ts
on: event('order.shipped')
```

## Options

| Option | Means |
|---|---|
| `option.event.key` | In `stopOn` of a flow: an arrow over `{ data }` of the event that answers the key of the runs it stops (`option.flow.stopOn`) |
| `option.event.data` | A type, as `object({ order: text() })`: the event is declared, `emit` of it holds its data to the type, and each `on` and `step.waitFor` of it is handed that type. A backend file exports the declaration, and the build lists it in `tent.d.ts` by its name |
| `option.event.where` | In `on` of a flow: the values that the data of the event must hold for the flow to start, as `{ flow: 'billing' }`. A flow is never started by `run.failed` or `run.stopped` of one of its own runs |

## Returns

The record `{ event: 'order.shipped' }`. A declaration is used as the event itself: `on: orderShipped`, `step.waitFor(orderShipped)`, `emit(orderShipped, data)`.

```ts
export const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })

export const tellCustomer = flow('tellCustomer', {
  on: orderShipped,
  run: async ({ event, step }) => {
    await step('mail', () => mailCustomer({ order: event.data.order }))
  },
})
```

## Errors

`code.T1014`: in `stopOn`, an event with no `key`. `code.T5111`, a warning: an event that no file declares is emitted with data of two shapes.

## See also

`word.emit`, `word.flow`, `option.flow.stopOn`, `code.T5111`, `option.project.cache`
