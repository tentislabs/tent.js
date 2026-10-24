# T7009 tool-not-described

A flow, a function or a screen that others are told of does not say what it is. The check finds it.

## Details

| The flow | Must state |
|---|---|
| States `access`, so the pages of the app may call it | `input`, also where it takes none: `input: {}` |
| States `offer`, so an outside door may call it | `about`, `input` and `output`. Its `access` is asked for by `code.T3001` |
| Is a tool of an agent | `about`, `input` and `output` |

A page draws the fields of a `Form` from the `input` of the flow it calls, and a caller at an outside door is told the flow by its `about`, its `input` and its `output`. An agent that is offered, or that is a tool of another, states `about`.

A query, a change, an action or a screen that states `offer: ['mcp']` states `about` too: a chat app is told its tool by that sentence.

A query written with `run` that answers a record of its own, or a list of them, states `output`: with none it answers rows as `db` handed them, or a number, and anything else is `code.T0009` while it runs. So does a change written with `run` that answers a record which code takes: the value of a call of it, the answer that `then` of a `Form` is handed, or `value` of `useCall`. With no `output` such a change answers nothing.

## The fix

State what is missing. `output` is the type of what it answers. `about` is one sentence on what the flow, the function or the screen is for, and when to use it.

## See also

`topic.flows`, `topic.mcp`, `word.flow`, `code.T3001`, `code.T3004`
