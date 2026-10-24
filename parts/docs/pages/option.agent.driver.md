# `driver` of `agent`

A driver of the builder's own that runs the agent.

## Value

The name of a driver made in `engine.ts`. Left out, the engine's own loop runs it.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  driver: 'planner',
})
```

## See also

`word.agent`, `adapter.Driver`
