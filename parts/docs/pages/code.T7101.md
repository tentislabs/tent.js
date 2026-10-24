# T7101 thread-too-long

A conversation has grown too long for the model of its agent: what the run would send does not fit what the model takes, also after the memory shortened it. The run fails with the status 400, and everything it saved stays.

## The fix

Give the memory a `shrink` that sends less of the older turns: `'drop'` leaves them out, and `'summary'` sends one summary of them, which the engine writes and keeps as a row of the conversation. A smaller `keep` sends fewer turns in full.

```ts
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], limits: { steps: 12, perRun: { tokensOut: 50000 } }, memory: { in: messages, thread: 'chat', keep: 6, shrink: 'summary' } })
```

## See also

`option.agent.memory`, `code.T7109`
