# `together` of `agent`

How many runs of the agent may work at once.

## Value

`{ max, then }`, counted for each key of a run: the thread of a conversation where the agent states no `key` (`option.agent.key`). Left out, any number.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  together: { max: 2, then: 'refuse' },
})
```

## See also

`word.agent`
