# `handsOver` of `agent`

The agents that this one may hand a conversation over to.

## Value

A list of agents. Left out, the agent hands nothing over.

The model is offered one more tool of the engine's own, `handOver`, whose input is `{ to, why }`: `to` one of these agents, by its name, and `why` a sentence. A call of it ends the run: the step `tool N.M handOver` keeps `{ to, why }`, so a page shows the hand-over, and the run answers the text the model wrote in that round, or `This conversation goes on with <to>.` (the word `handedOver` of `option.agent.words`). In the write that ends the run, the engine holds the conversation for the other agent in `_t_threads`, beside the run that works on it, and from then on a start of this agent on that conversation is a start of the one that holds it, which answers the next messages with its own instructions, tools, `trust` and `access`. The conversation and its memory go on: the two read it where they state the same `memory`.

The `access` of the other agent is asked for the starter at the hand-over: one the starter does not pass, and one that states no `access`, which the door finds for nobody, are answered to the model as `Error T3101: not allowed`, and nothing is handed over. The text of the round that hands over meets the `out` guards (`option.agent.guards`). The `trust` of this agent never carries over: a tool it trusts asks a person under the other one, unless that one trusts it too. A hand-over needs a conversation: in a run with no `thread` it ends the run, and there is no next message to hand on. A tool of the agent may not be told under the name `handOver` (`code.T1009`).

## Example

```ts
export const front = agent('front', {
  model: writer,
  instructions: 'Answer first, and hand bills over to billing.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  memory: { in: messages, thread: 'chat' },
  handsOver: [billing, support],
})
```

## Errors

`code.T1014`: an entry is no agent.

`code.T1009`: a tool is told under the name `handOver`.

## See also

`word.agent`, `option.agent.memory`
