# T0013 not-allowed-here

Something was used where it cannot work: a query writes nothing, a change waits for nothing, and code with no full access reaches nothing that needs it.

## Details

`word.each` raises it for an arrow that answers a promise where waiting is not allowed: in a query, a change, a rule and a view, and where no call is under way. It fails before it takes a second entry.

The engine raises it for what is used where it may not be:

| Used | Where it fails |
|---|---|
| A change | Called from a query, or from the arrow of a rule |
| An action | Called from a query, from a change, or from the arrow of a rule |
| `db.system`, `db.sql` and `db.n` | In a function that does not state `system`, where its caller is not the system |
| A `run` that answers a promise | In a query, a change and a rule, which answer at once |
| A definition or a handle | Where no call is under way, as in a maker |
| A handle, `start` or `emit` that this engine has nothing behind | Anywhere |
| `engine.open` | On a data folder that an engine holds open already, in a mode that is none of the three, and on an engine that was closed |
| A member of an app | After the app was closed |
| `fail` with a code of the form of a code of the framework, as `fail('T0006', ...)` | Where it is thrown |

## The fix

Use the thing in a place that allows it. A query calls queries, a change calls queries and changes, and an action calls anything. Full access needs `system: 'why'` on the definition. For `each`: write the arrow so that it answers a value, or move the work into an action or a step of a flow, where waiting is allowed.

## See also

`word.each`, `topic.values`
