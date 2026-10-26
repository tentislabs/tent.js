# T9004 untested

A warning. A function, a flow, a screen, a table or a route that no test touched in its last run.

## Details

`tent test` keeps what each test touched in `.tent/tests.json`: the functions and flows it called, the screens it drew, the tables it read and wrote, also through `app.rows` and `app.make`, and the routes it asked. `tent check` reads that record, and warns of each definition that none of them touched:

```ts
export const refund = action('refund', { access: role('staff'), ... })   // T9004: no test calls refund
```

An agent is a flow, and is held the same way. A project whose tests never ran has no record, and nothing is told. `tent impact` reads the same record, and names a changed definition that no test touched as untested.

## The fix

Write a test under `tests/` that reaches the definition, and run `tent test`: the warning is gone once a test touched it.

## See also

`command.test`, `command.check`, `command.impact`, `topic.tests`
