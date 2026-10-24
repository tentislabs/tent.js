# T3004 system-without-why

A function uses full access and states no `system`. Without it the function has none, and fails with `code.T0013` when it reaches that line.

## Details

Full access is `db.system`, `db.sql` and `db.n`, and the members of the handles that need it: `roles`, `keys`, `runs`, `workspaces`, and `set` and `remove` of `secrets`. The check reads a `run` that was read, and the code of one that was not.

A flow has full access unless it states `as: 'starter'`. So two more things are found:

| Found | Why |
|---|---|
| A flow that states `access` or `offer`, and neither `as: 'starter'` nor `system` | Whoever passes its rule would start work that passes every rule, and nothing says why |
| An action that states no `system`, and calls such a flow and waits for it | The call fails with `code.T0013` while it runs. `start`, which does not wait, is not held to this |

## The fix

State `system: 'why'`, with the reason: `system: 'staff refund any order, not only their own'`. Or reach the rows through `db`, under the rules of the caller. On a flow that is offered, state `as: 'starter'`, so that a run has the rights of whoever started it.

## See also

`option.query.system`, `option.change.system`, `option.action.system`, `code.T3009`
