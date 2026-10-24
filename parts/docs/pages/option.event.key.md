# `key` of `event`

In `stopOn` of a flow, the key of the runs that the event stops: the runs of the flow whose own `key` answers the same.

## Value

An arrow over `{ data }` of the event, which answers the key. An event in `stopOn` always states it.

## Example

```ts
stopOn: event('order.cancelled', { key: ({ data }) => data.order })
```

## Errors

`code.T1014`: an event in `stopOn` with no `key`.

## See also

`word.event`, `option.flow.stopOn`, `option.flow.key`
