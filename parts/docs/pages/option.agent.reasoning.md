# `reasoning` of `agent`

What becomes of the reasoning that the model writes for itself.

## Value

`{ show, save }`, each true or left out. Left out, the reasoning is dropped.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  reasoning: { show: true, save: true },
})
```

## See also

`word.agent`
