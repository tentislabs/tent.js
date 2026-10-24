# T7105 no-voice

A start of an agent was handed `audio` or `speak`, and the agent has no `voice`: the start is refused with the status 400, whoever starts it.

## The fix

Give the agent a `voice` with a model that hears and one that speaks, or start it with a `message` alone.

```ts
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], limits: { steps: 12, perRun: { tokensOut: 50000 } }, voice: { hear: listener, speak: speaker } })
```

## See also

`option.agent.voice`, `word.agent`
