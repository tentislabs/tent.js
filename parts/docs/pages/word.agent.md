# `agent`

An AI that works with tools. It is a helper word: it is written with values alone and is stored as a flow.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
})
```

## Options

| Option | Means |
|---|---|
| `option.agent.model` | The model that does the thinking. |
| `option.agent.instructions` | What the agent is told to do. |
| `option.agent.tools` | The tools of the agent. |
| `option.agent.limits` | The limits of a run of the agent. |
| `option.agent.about` | One sentence on what the agent is for. |
| `option.agent.access` | Who may start the agent through the door. |
| `option.agent.offer` | The outside doors the agent is offered to. |
| `option.agent.on` | What starts a run of the agent. |
| `option.agent.memory` | The table that holds the conversations of the agent. |
| `option.agent.voice` | The models the agent hears and speaks with. |
| `option.agent.trust` | Tools that send data out and may run without asking a person. |
| `option.agent.knows` | What the engine tells the model of the moment of a run: who started it, and when. |
| `option.agent.together` | How many runs of the agent may work at once. |
| `option.agent.key` | What a run of the agent is about, so that a start of the same key can join it. |
| `option.agent.pace` | How the starts of the agent are paced. |
| `option.agent.onStop` | The last work of a run of the agent that was stopped. |
| `option.agent.words` | Other words for the sentences the engine itself gives the model. |
| `option.agent.driver` | A driver of the builder's own that runs the agent. |
| `option.agent.policy` | What the agent may read, change and call in a workspace. |
| `option.agent.reasoning` | What becomes of the reasoning that the model writes for itself. |
| `option.agent.tell` | In which form the tools reach the model. |
| `option.agent.sequence` | Lets the model hand a sequence of tool calls, written in the words of a body. |
| `option.agent.output` | The type of the value that a run answers beside its text. |
| `option.agent.handsOver` | The agents that this one may hand a conversation over to. |
| `option.agent.questions` | Lets the model ask the person a question, and wait for the answer. |
| `option.agent.score` | Has a judge score a share of the finished runs. |
| `option.agent.guards` | Checks that the person's message, the answers of tools from outside and the answer itself must pass. |
| `option.agent.countBy` | For whom the runs of the agent are counted. |
| `option.agent.was` | The old name of the agent, where it was renamed. |

## Returns

A function that starts a run, waits for it and answers `{ text }`, and `{ text, value }` where it states `output`, with the five members `working`, `approve`, `refuse`, `stop` and `rate`. `working` is a query: a screen reads it as an entry of its `data`, `read(helper.working, { thread })`, or with `useQuery(helper.working, { thread })`, and is answered the caller's runs of the agent on that conversation, each `{ id, run, state, message, text, reasoning, error, asks, under }`, so a screen shows "Building" while one is `running` and the asks while one is `waiting`. `approve({ run, step, data })` gives the person's answer to a question that the model asked as its `data` (`option.agent.questions`), and `rate({ run, score, note })` keeps the starter's rating of a run (`option.agent.score`).

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`, `word.flow`
