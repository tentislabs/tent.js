# T5001 work-outside-step

The code of a flow did work outside a step. The check finds it beforehand, and the engine refuses it while running.

## Details

The code between two steps runs again on every pass of its run. So what matters must stand inside a step, where it is carried out once and its result is saved. Refused between two steps:

| Used | Why |
|---|---|
| A change, an action, a call of a service or of a model | It would be done again on every pass |
| A call of a flow or of an agent, and `start` | A second run would be started on every pass |
| A member of a handle that does more than read, as `mail.send` and `runs.stop` | It would be done again on every pass |
| `now()`, `random()` and `token()` | A later pass would draw another value |

Allowed there: a read through `db`, a call of a query, a setting, `log`, a member of a handle that only reads, and every value word that works on what it is handed.

## The fix

Do the work inside a step: `await step('a name', () => ...)`. The time and a random number between steps are `step.now()` and `step.random()`, which are saved. A token is drawn in a step of its own: `await step('code', () => token())`.

## See also

`topic.flows`, `word.flow`
