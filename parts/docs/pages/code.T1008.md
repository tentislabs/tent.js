# T1008 missing-option

A required option is left out.

## Details

Among them: `access` of a function, one of `rows` and `run` of a query, one of `set` and `run` of a change, `run` of an action and of a flow, `columns` of a table, `url` of a service, `provider` and `name` of a model, and `model`, `instructions`, `tools` and `limits` of an agent. A `users` table with no `roles` column is found under this code too, and so is a model with `job` that states no `limits.time`.

## The fix

State the option. The page of each word lists what it requires.

## See also

`topic.words`
