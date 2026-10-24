# `trust` of `agent`

Tools that send data out and may run without asking a person.

## Value

A list of tools, each as it stands in `tools`. Left out, every tool that sends asks.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  trust: [nightly],
})
```

## See also

`word.agent`
