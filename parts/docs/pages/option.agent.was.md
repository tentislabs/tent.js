# `was` of `agent`

The old name of the agent, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  was: 'aide',
})
```

## See also

`word.agent`
