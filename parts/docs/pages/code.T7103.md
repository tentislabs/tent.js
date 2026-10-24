# T7103 thread-busy

A start was refused because as many runs work already as may work at once, or because its conversation has a run that works or waits on it. A caller gets it with the status 409.

## Details

A flow that states `together: { max, then: 'refuse' }` refuses a start while `max` of its runs work. Where the flow states `key`, the runs are counted apart for each key. Where `then` is left out, a run over the count waits its turn, and nothing is refused.

One run holds a conversation at a time, from its start to its end, so that two runs never write its memory at once. A message to an agent on a conversation that has a run working on it, or one waiting on an ask of the person or on a question, is refused so: a call of the agent's function and `send` of `hook.useAgent` get this code, which `useAgent` holds in `error`.

## The fix

Start the run later. Leave `then` out where a start may wait its turn, or raise `max` where more runs may work at once.

For a conversation, wait for the run that holds it to end, or for its ask to be answered with `approve` or `refuse`, and send the message then. Or let the app hold the message until then: the screen reads `state` of `useAgent`, or the agent's `working` on that thread, keeps what the person wrote while a run is `'queued'`, `'running'` or `'waiting'`, and sends it once the run has ended.

## See also

`option.flow.together`, `topic.flows`
