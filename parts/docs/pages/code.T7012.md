# T7012 tool-not-as-starter

A flow that is a tool of an agent does not state `as: 'starter'`. The check finds it.

## Details

An agent runs as the person who started it, and may call only what they may. A flow with full access is no tool it may call: the call fails with `code.T0013` while it runs.

## The fix

State `as: 'starter'` on the flow. Work that needs full access is an action that states `system`, which may call the flow.

## See also

`option.flow.as`, `option.agent.tools`, `code.T7009`
