# `on` of `agent`

What starts a run of the agent.

## Value

One trigger or a list of triggers, as on a flow. Left out, a run is started by a call.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  on: every('monday at 08:00'),
})
```

## See also

`word.agent`
