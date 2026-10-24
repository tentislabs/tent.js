# `countBy` of `agent`

For whom the runs of the agent are counted.

## Value

`'caller'` or `'limits'`. Left out, the project's `countBy` holds.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  countBy: 'caller',
})
```

## See also

`word.agent`
