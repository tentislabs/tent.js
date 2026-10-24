# `knows` of `agent`

What the engine tells the model of a run, beside the instructions: facts it holds for certain, and the facts of the person kept in a table.

## Value

A list of `'caller'`, `'time'` and `{ facts: <table> }`. `'caller'` tells who started the run: a user by their id with their roles, a person who is not signed in, or the app itself. `'time'` tells the time the run started, in the zone of the project. `{ facts: preferences }` tells, in each model call, the starter's rows of a table of your own that states an `owner`, each with its id: read as the starter under the table's `read` rule and held to the rows the starter owns, so nobody is told another person's facts. A starter who is no user has none. The facts are written by a change of your own that you give the agent as a tool. Left out, the model is told none of them, and you choose what else it knows by its instructions and its tools. Any other word is `code.T1014`, and a table of facts that states no `owner` is `code.T7007` while running.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  knows: ['caller', 'time', { facts: preferences }],
})
```

## See also

`word.agent`
