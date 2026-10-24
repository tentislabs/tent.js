# T7017 trusted-reaches-ask

A tool that `trust` names reaches, where the check can see it, a function that asks a person. The check finds it.

## Details

A tool named in `trust` runs without asking the person. A function on its way that states `danger: 'ask'` would ask them in the middle of the work, which a trusted call may not: it is refused, and the tool stops halfway.

## The fix

Take the tool out of `trust`, so that the person is asked before it starts.

## See also

`option.agent.trust`, `option.action.danger`, `option.change.danger`
