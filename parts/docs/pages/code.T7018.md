# T7018 asks-in-the-middle

A tool would ask the person in the middle of its work. A warning of the check.

## Details

The check warns of:

- a tool that is neither asked about nor named in `trust`, and can be seen to reach a function that asks, or to set off a flow that sends: the person will be asked in the middle of its work, after some of it is done;
- a tool that an agent names in `trust`, where that agent is itself a tool of another: called that way, its `trust` does not hold, and each of those tools asks.

## The fix

State on the tool what it does, `danger: 'ask'` or that it sends, so that the person is asked before it starts. Leave `trust` to the agents that a person starts.

## See also

`option.agent.trust`, `option.action.danger`, `option.action.sends`
