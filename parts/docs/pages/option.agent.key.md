# `key` of `agent`

What a run of the agent is about, such as the conversation it answers: a start of the same key can join the run under way, and `runs.find` finds it. A run of an agent is a run of a flow, so it is the `key` of a flow.

## Value

An arrow that is handed `{ input, event }`: what the start takes, `{ message, thread, files }`, and the event of its trigger. It answers the key: text, or a number, which is kept as its text. Left out, the key of a run is the thread of its conversation, where it has one, and else it has none.

## Example

```ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with an order.',
  tools: [orderOf],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  key: ({ input }) => input.thread,
  together: { then: 'join' },
})
```

## Errors

`code.T1014`: `key` is no arrow.

## See also

`option.flow.key`, `option.agent.together`, `word.agent`
