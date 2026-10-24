# `voice` of `agent`

The models the agent hears and speaks with.

## Value

`{ hear, speak, name, language, whole }`. Left out, the agent has no voice.

`hear` is the model that writes down a recording that a run was started with, in the step `hear`: what it heard is the person's message, which the memory table keeps as their row (`hook.useAgent`). `speak` says the answer, sentence by sentence in the steps `speak 1` and on, or as one sound where `whole` is true, in the voice that `name` names.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  voice: { hear: embedder, speak: embedder, name: 'calm', language: 'en', whole: true },
})
```

## See also

`word.agent`
