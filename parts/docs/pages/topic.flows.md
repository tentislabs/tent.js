# Flows

A flow is work that is saved step by step. Each step is carried out once and its result is kept in the data of the app, so a flow waits for days, is tried again after a failure, and goes on after the program was stopped, with no queue server beside it.

## How a run runs

A start of a flow adds a run. The engine takes the run up and calls `run` from its top. Each time `run` comes to a step whose result is saved, the step answers that result and its work is not called. When it comes to a step that has no result yet, the work is carried out and its result is saved before the step answers.

A wait ends the pass. Later the engine calls `run` from its top again: the finished steps answer at once, and the run goes on behind the wait. So the code between two steps runs on every pass. It may read, through `db`, a setting and `log`, and it must do nothing else: a change, an action, a call of a service or of a model, a call of a flow, `start`, `now()`, `random()` and `token()` belong inside a step.

```ts
import { flow, text } from 'tentjs'
import { markWelcomed, sendWelcome } from './functions.ts'

export const welcome = flow('welcome', {
  input: { user: text() },
  run: async ({ input, step }) => {
    await step('send the mail', () => sendWelcome({ user: input.user }))
    await step.wait('3 days')
    await step('mark', () => markWelcomed({ user: input.user }))
  },
})
```

## The step tools

`run` is handed `step`, which is the tool for one step and holds the others.

| Tool | Does |
|---|---|
| `step(name, work, o?)` | Carries `work` out once and saves what it answers. A name that is used again gets a repeat number by itself, counted from 1, so the steps of a loop are kept apart |
| `step.wait('3 days')`, `step.wait(until)` | Waits for a length of time, or until a moment: a `Date`, or its text in the standard form. It is saved as a step named `wait`, or by `{ name }` |
| `step.waitFor('approval', { timeout, show })` | Waits for a person. `runs.approve(run, 'approval', data)` and `runs.refuse` answer it, and it answers `{ approved, data }`, or `{ timedOut: true }` after its `timeout`, which is 7 days where none is stated |
| `step.waitFor(event('order.shipped'), { where, timeout })` | Waits for an event that a change emits. `where` is a filter over the data of the event, so that a run waits for its own order. It answers `{ data }` |
| `step.all([...])`, `step.all(list, arrow)` | Several steps side by side, and waits for all of them |
| `step.first([...])`, `step.first(list, arrow)` | Several side by side, and goes on with the first that ends. The others stop at their next step |
| `step.now()`, `step.random()` | A time and a random number that are saved, so that a later pass reads the same value |
| `step.done(value?)` | Ends the whole run as done, with the value as the answer of the flow, from wherever it is called |
| `step.again(input?)` | Ends the run as done and, in the same write, starts a new run of the same flow with that input, or its own where it is handed none, the same key and starter, and `from` naming the run before. So a subscription that renews every month for years never meets `limits.steps`. Nothing of the saved steps is carried over: what the new run needs is in its input |

A step that states `sealed: true`, `step('card', work, { sealed: true })`, or every step of a flow that states `sealed: true`, saves what it answers sealed with the key of the secrets, bound to its run, its step and its repeat, as a sealed column is: the data file, a backup, another run and `runs.read` hold the sealed text alone, the run that saved it reads it back opened, and a person's export opens it for them. With no key at hand such a step fails with `code.T0019`.

A step answers its result as it was saved: plain data, in which a `date` is text in the standard form, on the pass that made it and on every later one. The input of a run is read back through the types of `input` on every pass, so a `date` of it is a `Date`.

## What starts a run

| Started by | How |
|---|---|
| `start(flow, input)` | From a change, an action or a step. It answers `{ run }` and does not wait. In a change the start is part of the write |
| A call of the flow, `await welcome(input)` | From an action or a step. It starts a run, waits for it, and answers the answer of the flow. A run that failed fails the call with its error |
| A trigger of a table, `on: orders.added({ where })`, `orders.changed({ where, columns })` or `orders.removed({ where })` | As part of the change that wrote the row, once for each row that fits. `event.row` is the row as it was written |
| `on: event('order.shipped')` | When a change calls `emit('order.shipped', data)`, as part of that write |
| `on: every('day at 09:00')`, `on: cron('0 9 * * *')` | By the clock. A time that was missed while the program was off fires once |

A trigger of a table fires for a row that fits its `where`, read as the write left the row, through its links too. A `changed` trigger is handed `event.before` too, the row before the change, and `event.columns`, the columns whose values the change made different; one that names `columns` fires only where one of them is among those. A column that work fills starts only a `changed` trigger that names it. This flow starts a run when a note becomes done, and none when the body of a done note changes after:

```ts
export const onDone = flow('onDone', {
  on: notes.changed({ where: { state: 'done' }, columns: ['state'] }),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ note: event.row.id, was: event.before.state }))
  },
})
```

A flow is given what its `input` declares, and anything else is `code.T0002`. A flow has full access, because no user is present: one that states `as: 'starter'` runs with the rights of the caller who started it, and each function it calls passes its own rule as that caller. A flow with full access is called and waited for only from code that has full access too, a function that states `system`; `start` is not held so. Runs call each other three deep, and one more is `code.T5105`.

A change that a step calls is carried out once, also where the step runs a second time after a failure or a restart: the engine keeps a once-only key for each call of a step, made from what is called and with what. So a second try writes no row twice.

## A flow that a page calls

A flow that states `access` may be called by the pages of the app as a function is: `<Form call={welcome}>` draws its fields from the `input` of the flow. The call starts a run, waits for it, and answers what the `output` of the flow names. Such a flow states `as: 'starter'`, or `system` with the reason it has full access.

A run that outlasts `actionTime` goes on, and the caller is answered `code.T0008` with the id of the run in `fields.run`. The same call with `{ run }` alone waits for that run again, and with `{ run, stop: true }` stops it, for the caller who started it.
