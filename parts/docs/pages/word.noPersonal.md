# `noPersonal`

A guard of the engine's own that refuses an answer which holds a personal value the starter may not read, or a private one.

## Example

```ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer of the customers of the person asking.',
  tools: [myCustomers],
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  guards: { out: [noOtherPeople, noPersonal] },
})
```

## Returns

A guard to stand in `guards.in` or `guards.out` of an agent. It looks for the value of each column marked `personal` or `private` in the text it is handed, without regard to capitals, for values of four characters or more: a text, a day, a number by its digits, a moment by its day, and each value of a list, a record or a `json`. A yes or a no, a link, a file and a vector hold no value a text names. A personal value of a row that the starter may not read refuses the text, and a private value of any row does, since a private column never leaves the server in a row. A personal value of a row the starter may read passes. It runs as the starter, and passes everything for a run that the system started. A sealed column is not looked at, and a tenant table is looked at in the file of each tenant the run read.

## Errors

`code.T7131`: the answer held a personal or private value.

## See also

`option.agent.guards`, `word.noOtherPeople`
