# `words` of `agent`

Other words for the sentences the engine itself gives the model.

## Value

A record from the name of a sentence to its text. Left out, the engine's own words hold. The names are `asksFirst`, `refused`, `unfinished`, `tooLarge`, `file`, `summary`, `list`, `call`, `sequence`, `gives`, `reads`, `writes` and `sends`; `answer`, the sentence of the tool `answer` of an agent that states `output`; `guarded`, what the person is answered where a guard refused and `guards.refused` says nothing; `handOver` and `question`, the sentences of those two tools; `handedOver`, the answer of a run that handed its conversation over, where `{}` stands for the other agent; `recalled` and `facts`, the first lines of the messages of what was recalled and of the facts of the person; and `joins`, the sentence of the line of a flow that is a tool, where a start may join a run of it already under way.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  words: { refused: 'The person said no.' },
})
```

## See also

`word.agent`
