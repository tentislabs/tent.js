# T7010 no-access

An agent that a screen file imports states no `access`. The check finds it.

## Details

A screen talks to an agent through the door. Without `access` nothing may start it there, so the screen would be refused. An agent that states `offer` with no `access` is `code.T3001`, its one code.

## The fix

State who may start it.

```ts
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], access: 'signedIn', limits: { steps: 12, perRun: { tokensOut: 50000 } } })
```

## See also

`option.agent.access`, `word.agent`, `code.T3001`
