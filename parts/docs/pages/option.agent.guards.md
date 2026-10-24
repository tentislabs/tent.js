# `guards` of `agent`

Checks that the person's message, the answers of tools from outside the app and the agent's own answer must pass.

## Value

`{ in?, out?, refused? }`. `in` and `out` are lists of guards; `refused` is the text the person is answered where a guard does not pass, and `That cannot be answered here.` when it is left out (the word `guarded` of `option.agent.words`). Left out, nothing is guarded.

A guard is a function or a flow whose input is `{ text, from }` and whose answer is `{ pass: boolean, why?: text }`, written by the builder; a `judge` (`word.judge`), which passes where its score reaches its `pass`, handed the person's message of the turn as the task and the text as the answer, and named in its steps by its model; or one of the engine's own: `word.noOtherPeople` and `word.noPersonal`. `from` is `'person'`, `'tool'` or `'assistant'`. A model of any kind is a guard as a judge.

- Each `in` guard runs before the first model step, on the person's message, and on the answer of each tool that came from outside the app before the model reads it, and on its error, which carries the tool's own words, also where the model calls it by its name with `call`: a tool of an outside server or of a source, code, a `python`, a plain body that calls a service, an action, `files.text` or `hear`, and a query over a table that others than a row's owner may write. Its step is `guard in 1 <guard>` for the message, and `guard in N.M <guard>` for the answer of the tool call `tool N.M`.
- Each `out` guard runs on the final answer, with its typed value where the agent states `output`, before it is kept in memory or sent, in the step `guard out <guard>`; on what the model writes beside its tool calls, and so on the text of a hand-over, in the step `guard out N <guard>`; and on a question to the person before it is shown, in the step `guard out N.M <guard>`. Where `out` guards stand, the text of the answer is not sent to whoever follows the run as it is written. An answer that a sequence made meets them too, and a run with `output` that ends in prose keeps none of it.

A guard that does not pass, or that fails, fails its step with `code.T7131`, which names the guard and its `why`. The turn ends there: the run is done, its answer is `{ text: refused }` with no value, the conversation keeps that text and nothing the model wrote, and the answer of a tool that a guard refused is kept as refused, so the model never reads it. A guard runs as the starter of the run, and its model calls count on the run's `perRun`.

## Example

```ts
export const careful = agent('careful', {
  model: writer,
  instructions: 'Answer with care.',
  tools: [news, myOrders],
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  guards: { in: [tone], out: [tone, noOtherPeople], refused: 'Sorry, that is not something I can answer.' },
})
```

## Errors

`code.T7131`: a guard did not pass.

## See also

`word.agent`, `word.noOtherPeople`, `word.noPersonal`, `option.agent.output`
