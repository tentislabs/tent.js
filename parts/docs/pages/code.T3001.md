# T3001 no-access-rule

A flow or an agent names a door in `offer` and states no `access`. It is offered to the API, to MCP or to the app's own command line, and nothing says who may start it there.

## Details

`access` is no required option of a flow or of an agent: one that only the app starts needs none. Once `offer` names a door, callers from outside reach it, and the rule must be written down. A query, a change, an action, a route and a screen state `access` as a required option, so one with none is `code.T1008`.

## The fix

State who may start it: `access: 'signedIn'`, or `role('staff')`. Or take the door out of `offer`.

## See also

`code.T1008`, `code.T3002`, `word.flow`, `word.role`
