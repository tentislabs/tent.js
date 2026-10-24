# `judge`

A model that scores an answer against a rule from 0 to 1, with one sentence of reason.

## Example

```ts
score: { share: 0.05, with: judge(writer, 'Answers from the documents and names the page') }
```

## Options

| Option | Means |
|---|---|
| `option.judge.pass` | The score at which an answer passes, from 0 to 1. 0.7 where it is left out. |
| `option.judge.words` | Other words for the request a judge is asked with, in place of the engine's own. |

## Returns

`judge(model, rule, { pass, words })` answers a judge, which stands in `score.with` of an agent (`option.agent.score`), among the `guards` of an agent, where it passes a text whose score reaches its `pass` (`option.agent.guards`), and in `expect` of a case (`topic.tests`). Two judges of our own hold rules that a judge alone cannot know: `judge.fromTools(model)` holds an answer to what the tools of its run answered, and is handed each tool with its answer, so an answer that holds what no tool answered scores low; `judge.onTask(model)` holds an answer to the task of its agent, and is handed the agent's `about` and `instructions`. It is imported from `tentjs` in a backend file and from `tentjs/test` in a test.

The judge's model is asked for `{ score, why }` with `fill`, so it needs the ability `typedAnswers`. The request holds the engine's words of a judge, then the task, the answer and the rule as JSON. A model of another kind, which states its own `input` and `output` (`option.model.input`), is a judge too: it is called as a function, handed `{ task, answer, rule }`, with `answered` for `judge.fromTools` and `agent` for `judge.onTask`, and answers `{ score, why }`.

## Errors

`code.T7108`: the model did not answer a score and a reason, twice.

## See also

`option.agent.score`, `topic.tests`
