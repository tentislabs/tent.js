# When a step fails

This page says what follows when a step fails, and gives typed events, a run that is stopped, the limits of a run and a key for a run.

## A step that fails

A step that fails is tried again: after 5 seconds, then after 30 seconds, then after 3 minutes. It is tried 4 times in all, unless `tries` of the flow or of the step says otherwise: `step('charge', work, { tries: 2 })`. The run waits meanwhile. Not tried again is a failure that a second try would only repeat: the own `fail` of the app, and an error of the framework that says the call itself was wrong, as `code.T0002` and `code.T3101`.

A step that has failed for good refuses its promise with its error, on that pass and on every later one. Code may catch it and go on. A step that states `onFail: 'goOn'` does not refuse: it answers `{ failed: true, code, message }`, so a flow reads `r?.failed` and goes on. A run whose `run` lets an error out has failed, and keeps the error and its finished steps.

## Typed events

`export const orderShipped = event('order.shipped', { data: object({ order: link('orders') }) })` in a definition file declares an event with the shape of its data. `emit(orderShipped, data)` holds the data to it - the type checker before, `code.T0002` while running - and every `on` and `step.waitFor` of it is handed that type (`word.event`). An event with no declaration works as ever, with its data untyped; the check warns where one such name is emitted with two shapes (`code.T5111`).

## A run that is stopped, and hearing of other runs

`onStop` is the last work of a run that was stopped, by `runs.stop`, `tent runs stop` or `stopOn`: it is carried out once, its steps saved under their names with `onStop.` in front, and it is handed `stopped`, the step that was at work and what that step kept of its progress, so that it can take back what was half done (`option.flow.onStop`). The run is `stopped` once `onStop` has ended; a second stop ends it at once.

When a run of a flow ends failed or stopped, the engine raises `run.failed` or `run.stopped`, `{ flow, run, key, failure }`, in the write that ends the run. A flow listens to them as to any event: `on: event('run.failed', { where: { flow: 'billing' } })` starts a run for each failure of `billing`, in that very write, so that someone is told. A flow is never started by the failure or the stop of one of its own runs, so a flow on `run.failed` with no `where` cannot start itself without end.

## Limits

Each is what holds where the flow states nothing, and `limits` of the flow changes it.

| Limit | Holds | Its error |
|---|---|---|
| `steps` | 1,000 steps in one run | `code.T5101` |
| `result` | 1 MB for the result of one step, and for the answer of the flow | `code.T5102` |
| `wait` | 1 year for one wait | `code.T5103` |
| `time` | 30 days of work in one run, waits not counted | `code.T5104` |
| `pass` | 5 seconds of work between two steps | `code.T5104` |

Ten runs of one flow work at the same time, and one more waits its turn: `together: { max }` changes the count.

## A key for a run

`key` names what a run is about: `key: ({ input }) => input.order`. A run that a table trigger started has the id of its row as its key where the flow states none. The key holds the work of one thing together:

- `together` counts the runs of a flow for each key, and `together: { then: 'join' }` answers a start whose key has a run under way with that run, and starts nothing: a webhook sent three times makes one run (`option.flow.together`).
- `stopOn: event('order.cancelled', { key: ({ data }) => data.order })` stops the runs of the key in the write that emits the event (`option.flow.stopOn`).
- `runs.find({ flow: 'ship', key })` answers the runs of one key (`handle.runs`).
- `together: { group: 'perTeam', max: 5 }` on several flows whose `key` is the team counts their runs together.
- `pace` holds a burst of starts of a key: `debounce` waits until the starts are quiet, `perMinute` lets so many start in a minute and the rest wait, `drop` drops the rest, `batch` hands one run the events of many, and `order` and `turns` order the starts that wait (`option.flow.pace`).
