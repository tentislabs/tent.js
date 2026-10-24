# T4005 async-run

The `run` of a query or of a change is written `async`. Both answer at once: a query reads through `db`, and the whole of a change is one write, which cannot wait for anything outside.

## Details

It is also found for an `async` arrow that is handed to `each` in a query, in a change or in the arrow of a rule, where nothing may be waited for. The type checker refuses the same `run`, as `code.T8000`.

## The fix

Take `async` away. What must be waited for belongs in an action, which calls the query or the change.

## See also

`option.query.run`, `option.change.run`, `word.each`, `topic.check`
