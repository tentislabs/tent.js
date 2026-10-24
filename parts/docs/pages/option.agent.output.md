# `output` of `agent`

The type of the value that a run of the agent answers beside its text.

## Value

A type: `object({ category: choice(['bug', 'question', 'refund']), reason: text() })`, or any other type. Left out, a run answers `{ text }` alone.

With `output` the model is offered one more tool of the engine's own, `answer`, whose input is that type: a record type as it is, and any other type as `{ value }`. The run ends when the model calls it with a value that fits, and answers `{ text, value }`: the text the model wrote in that round, and the value. A value that does not fit is answered to the model as `code.T0002`, with a line for each field, as for any tool, and the model may call `answer` again. A run that ends with no call of `answer` fails with `code.T7130`: prose is never passed off as a value.

The value reaches whoever waits for the run: `await sorter({ message })` in an action or a step answers `{ text, value }`, `evals` holds it to `expect.value`, and the API and MCP answer it with the type in their descriptions. The `out` guards of the agent read the value too (`option.agent.guards`). A tool of the agent may not be told under the name `answer` (`code.T1009`).

## Example

```ts
export const sorter = agent('sorter', {
  about: 'Sorts a message into a bug, a question or a refund',
  model: writer,
  instructions: 'Sort the message.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
  output: object({ category: choice(['bug', 'question', 'refund']), reason: text() }),
})

const { value } = await sorter({ message: 'The page does not load.' })
```

## Errors

`code.T7130`: the run ended with no call of `answer`.

`code.T1009`: a tool is told under the name `answer`.

## See also

`word.agent`, `option.agent.guards`
