# T6023 bad-data-entry

An entry of `data` reads what cannot be read, or states what its kind does not take.

## Details

Each entry of `data` is `read(what, input, { needed, wait, refresh })`, where `what` is a query or an action.

| Mistake | Why |
|---|---|
| An entry that reads a table, a change or anything else | A screen reads rows through a query, which states who may read them |
| `wait: false` on a query that answers at once | There is nothing to wait for. It is for an action and for a query that states `heavy` |
| `refresh` on a query | A query follows its rows by itself. `refresh` asks an action again on a timer |
| `needed` in a component | Only an entry of the screen itself decides whether the screen is found |

## The fix

Read a query or an action, and take away what the entry cannot state.

## See also

`word.read`, `option.screen.data`, `option.component.data`
