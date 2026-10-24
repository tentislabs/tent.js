# `data` of `event`

The type of the data of the event, which declares it: `emit` of it holds its data to the type, and each `on` and `step.waitFor` of it is handed that type.

## Value

A type, as `object({ order: text() })`. A backend file exports the declaration, and the build lists it in `tent.d.ts` by its name. Left out, the event is not declared, and its data is what each `emit` hands it.

## Example

```ts
export const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })
```

## Errors

`code.T5111`, a warning: an event that no file declares is emitted with data of two shapes.

## See also

`word.event`, `word.emit`, `word.flow`
