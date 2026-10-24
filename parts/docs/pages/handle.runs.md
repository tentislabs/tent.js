# `runs`

Reads the runs of the flows of the app, answers a step that waits for a person, stops a run, works on many runs at once, and pauses a flow. It is full access: a function uses it only where it states `system`.

## Example

```ts
import { action, role, runs, text } from 'tentjs'

export const approveInvoice = action('approveInvoice', {
  access: role('manager'),
  system: 'it answers the approval that a run of the invoice flow waits for',
  input: { run: text() },
  run: async ({ input, user }) => {
    await runs.approve(input.run, 'approval', { by: user.id })
  },
})
```

## Members

| Member | Does |
|---|---|
| `read(run)` | Answers one run by its id, with its steps, or nothing where there is none |
| `find({ flow, key, startedBy, states, since, before, newest })` | Answers the runs that fit, the newest first. `key` is the key of a run (`option.flow.key`), `since` and `before` are moments that its start lies at or after and before, and `newest` is how many |
| `approve(run, step, data?)` | Answers the step of that name that waits for a person: `step.waitFor` then answers `{ approved: true, data }`. A question of an agent (`option.agent.questions`) is answered so only in a run that the system started, with `data` that fits it (`code.T3101` and `code.T0002` otherwise) |
| `refuse(run, step, data?)` | The same, with `{ approved: false, data }`. The flow goes on, and decides by what it reads |
| `stop(run)` | Stops a run, and every run it waits for. Whoever waits for it gets `code.T5106` |
| `stopAll({ flow, key, state, since, before })` | Stops every run of the flow that has not ended and fits, each as `stop` stops one. `state` is one state or a list, and `since` and `before` are moments, a `Date` or its text. Answers `{ count, runs }` |
| `replayAll({ flow, key, state, since, before, from })` | Replays every run of the flow that fits, each as `tent runs replay` replays one: from the step `from`, and where a run saved none of that name, or `from` is left out, reusing every step that was done. Answers `{ count, runs, started }`, `started` being the new runs |
| `pause(flow)`, `resume(flow)` | Pause a flow on every machine and across a restart, so that its new starts are kept and its runs that come due wait, and let it go again, in its order |
| `paused()` | Answers the names of the flows that stand paused |
| `rate(run, { score, note })` | Keeps a rating of a run of an agent, as its starter's, in the table that `shows: 'scores'` reads. For backend code that held its own rule, as a link in a mail that a person answered |

Of an app that keeps a data file for each tenant, `stopAll`, `replayAll` and `resume` reach the runs of every file, a closed one too. On a reader the four that write are carried out by its writer, and `stopAll` and `replayAll` answer the writer's count.

Each member answers a promise. A run is `{ id, flow, key, state, startedBy, input, answer, error, steps }`, and its `state` is `queued`, `running`, `waiting`, `done`, `failed` or `stopped`. Each step holds its `name`, its `repeat`, its `state`, and its `result` or its `error`. A step that waits shows what its `step.waitFor` stated as `show`.

`approve` and `refuse` answer the earliest waiting step of that name. `{ repeat }` as a fourth value names which pass of a step that runs several times.

## Errors

`code.T0013` in code that has no full access, and for every member but `read` and `find` inside an action that a screen reads as `data`. `code.T0001` for a run that is not there, and `code.T0002` where no step of that name waits for an answer.

## See also

`topic.flows`, `word.flow`, `word.start`
