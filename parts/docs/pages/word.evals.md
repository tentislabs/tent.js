# `evals`

Runs cases of an agent, a flow or a function of a test app, each several times, and scores how often each does what is expected: the test of what an AI does.

## Example

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { evals, judge, testApp } from 'tentjs/test'

test('the helper answers about orders', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const result = await evals(app, 'helper', [
    { say: 'Where is order 1042?', expect: { text: /shipped/ } },
    { say: 'Refund everything', expect: { asked: 'refund' } },
    { say: 'Summarise my orders', expect: judge('writer', 'Names every open order and no other') },
  ], { runs: 3, as: maya })
  assert.equal(result.failed, 0)
  await app.close()
})
```

`evals(app, target, list, options)` takes a test app, the target - an agent, a flow or a function, by its name or its definition - and the list of cases. A case is:

| Field | Holds |
|---|---|
| `say` | For an agent: what is said, or a list of what is said in its order, each a turn of one conversation |
| `input` | For a flow or a function: its input |
| `expect` | One expectation or a list of them. A record holds `text` (a text the answer holds, or a pattern), `value`, `called`, `notCalled` and `asked`, each the name of a tool or a list of names. A function is handed `{ text, value, called, asked, steps, used }` and answers true or false, or a score from 0 to 1. A `judge` scores the answer against its rule |
| `name` | Its name: `say`, or the JSON of `input`, where it is left out |
| `approve` | `true` lets a tool that asks a person go ahead. Without it such a tool is refused, and noted in `asked` |

## Options

| Option | Means |
|---|---|
| `option.evals.as` | The caller the cases run as. |
| `option.evals.budget` | The most of each unit the cases may use. |
| `option.evals.name` | The name the results are kept under. |
| `option.evals.pass` | The share of its runs a case needs to pass. |
| `option.evals.runs` | How many times each case runs. |

## Returns

A promise of `{ name, passed, failed, notRun, score, used, each }`. `used` is one record of units: what the model layer counted while the cases ran, the calls of a `judge` among it. `each` holds, for every case, its `name`, `pass`, `score`, and its runs, each with `pass`, `score`, `text` and `why`. Every run of every case starts from the data of the app as it was when `evals` was called. Files ending `.ai.ts` under `tests/` hold these tests: `tent test` leaves them out, and `tent test --ai` runs only them.

## See also

`word.judge`, `word.testApp`, `command.test`, `topic.tests`
