# `score` of `agent`

Has a judge score a share of the finished runs of the agent, from real use.

## Value

`{ share, with }`: `share` a number from 0 to 1, the share of the finished runs that are scored, and `with` a judge, `judge(model, rule)` or one of the judges of our own, `judge.fromTools(model)` and `judge.onTask(model)` (`word.judge`). Left out, no run is scored.

Which runs are scored is drawn from the id of each run, so a run is scored or not for good, also after a restart. A run that is scored is scored after it ended, outside it, so nobody who waits for the run waits for its score: the judge's model scores the answer from 0 to 1 against the rule, with one sentence of reason, as the system and never as the starter, on a budget of its own and never on the `perRun` of the run. The score is kept in the engine's table of ratings and scores, which a table that states `shows: 'scores'` reads (`option.table.shows`), as a row whose `kind` is `'score'`, whose `caller` is the system, and whose `user` is the starter of the run. The judge's model call is counted as every model call is, on the judge's model. A judge that fails is written to the log, and the run keeps no score. A model of any kind is a judge: one that states its own `input` and `output` is called as a function (`word.judge`). Nothing of the run is sent to a model the app does not declare.

People rate the runs too: `helper.rate({ run, score, note })` for the starter of a run, and `runs.rate(run, { score, note })` for backend code that states `system`, each kept as a row whose `kind` is `'rating'`. `tent test --ai --from-runs <agent>` writes the rated runs as a file of evals (`command.test`).

## Example

```ts
export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer from the documents, and name the page.',
  tools: [findInDocuments],
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
  score: { share: 0.05, with: judge(writer, 'Answers from the documents and names the page') },
})
```

## Errors

`code.T1014`: `share` is no number from 0 to 1, or `with` is no judge.

## See also

`word.agent`, `word.judge`, `option.table.shows`
