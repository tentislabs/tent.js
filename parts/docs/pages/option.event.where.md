# `where` of `event`

In `on` of a flow, the values that the data of the event must hold for the flow to start, and in a wait, for the wait to be done.

## Value

A record of values by the names of the fields of the data, as `{ flow: 'billing' }`. Left out, every event of that name starts the flow, or ends the wait. A flow is never started by `run.failed` or `run.stopped` of one of its own runs.

## Example

```ts
on: event('run.failed', { where: { flow: 'billing' } })
```

## See also

`word.event`, `option.flow.on`
