# `questions` of `agent`

Lets the model ask the person a question, and wait for the answer.

## Value

`true`. Left out, the model asks nothing.

The model is offered one more tool of the engine's own, `question`, whose input is `{ question, choices?, shape? }`: `choices` a list of answers of which the person gives one, and `shape` a JSON Schema of the answer, as `{ type: 'object', properties: { count: { type: 'number' } }, required: ['count'] }`. The question meets the `out` guards first (`option.agent.guards`): one they refuse is shown to nobody, and the model is told so. The step `question N.M` is a wait for a person: it waits up to `limits.ask` and shows `{ tool: 'question', input }`, so `working`, `useAgent` and `useRun` list it among the asks. The screen that asks is the builder's: it shows the question and calls `helper.approve({ run, step, repeat?, n?, data })`, the answer as `data`. An answer that is none of the `choices`, that does not fit the `shape`, or that is left out, is refused with `code.T0002` and the question still waits; one that fits is what the tool answers the model. `helper.refuse` and the end of `limits.ask` answer the model `The person refused this.` Only the starter of the run answers: for anyone else the run is not found (`code.T0001`). Backend code answers it with `runs.approve` only where the system started the run, as it answers an ask of such a run (`code.T3101` otherwise), and with an answer that fits. A tool of the agent may not be told under the name `question` (`code.T1009`).

The engine's own loop offers the tool: a driver of your own (`adapter.Driver`) reads `questions` from the record of the agent and asks the person in its own way.

## Example

```ts
export const asker = agent('asker', {
  model: writer,
  instructions: 'Ask what you need to know.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  questions: true,
})

await asker.approve({ run, step: 'question 1.1', data: 'M' })
```

## Errors

`code.T0002`: `helper.approve` was handed an answer that does not fit, or none.

`code.T0001`: `helper.approve` named a run that is not the caller's.

`code.T3101`: backend code answered the question of a run that a person started.

## See also

`word.agent`, `hook.useAgent`, `handle.runs`
