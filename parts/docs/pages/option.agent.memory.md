# `memory` of `agent`

The table that holds the conversations of the agent.

## Value

`{ in, thread, of, keep, after, shrink, model, recall }`, of which `in` is required. Left out, a run uses no memory.

`shrink: { nearest: <count> }` sends of the older turns of the conversation, beside the latest `keep`, the `<count>` nearest by meaning to the newest message, each turn whole and in its place. `recall: <count>` adds, before each model step, one message of the engine's own: so many older messages of the starter, of every conversation the starter may read, nearest by meaning to the newest one, which are not sent in full by `keep` and `shrink`. For both, the memory table states a vector column that the engine fills from `text`, as `meaning: vector({ size: 1536, model: embedder, by: 'text' })`; the newest message is turned into a vector by that column's model in the step `recall`, once a run. The turns of the conversation are its own, as every turn is sent; the rows that `recall` brings are found with `near` under the table's `read` rule and held to the rows the starter owns, so nothing of another person is recalled. A table with no such column is `code.T7007`.

Facts about the person are told by `knows` (`option.agent.knows`), and written by a change of the builder's own given to the agent as a tool.

The engine's own loop reads and writes the memory table: a driver of your own (`adapter.Driver`) writes the rows of its runs itself, as `code.T7007` gives them.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  memory: { in: notes, thread: 'team', keep: 10, after: 10, shrink: 'summary', model: embedder },
})
```

## Errors

`code.T7007`: the memory table of `recall` or of `shrink: { nearest }` holds no vector column filled from `text`.

## See also

`word.agent`
