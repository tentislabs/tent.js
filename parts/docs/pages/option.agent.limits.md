# `limits` of `agent`

The limits of a run of the agent.

## Value

`{ steps, perRun, time, ask, result, toolCalls, toolsAtOnce, pass }`, each the builder's to state. With no `steps`, no number of calls to the model ends a run; with no `perRun`, a run has no budget. Left out, the agent states no limits of its own, and `time`, `ask`, `result`, `toolCalls`, `toolsAtOnce` and `pass` hold their defaults: 10 minutes, 7 days, 1 MB, 100, 8 and 5 seconds.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
})
```

## See also

`word.agent`
