# `noOtherPeople`

A guard of the engine's own that refuses an answer which names a row the starter of the run may not read.

## Example

```ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer of the orders of the person asking.',
  tools: [myOrders],
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  guards: { out: [noOtherPeople] },
})
```

## Returns

A guard to stand in `guards.in` or `guards.out` of an agent. It finds every id of a row in the text it is handed - the answer of the model, and its typed value where the agent states `output` - and holds each against the tables of the app: an id of a row that the starter may not read, under the table's `read` rule, refuses the text. An id of no row passes. It runs as the starter, and passes everything for a run that the system started. A tenant table is looked at in the file of each tenant the run read, under its rule there.

## Errors

`code.T7131`: the answer named a row of another person.

## See also

`option.agent.guards`, `word.noPersonal`
