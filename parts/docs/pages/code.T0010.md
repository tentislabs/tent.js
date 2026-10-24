# T0010 no-engine

A definition or a handle was used with nothing in the runtime slot. A word only records what it is given: the work behind a call is the engine's, and it reaches the engine through one slot.

## Details

It is raised by a call of a query, a change, an action, a flow, an agent or a model, by a call of a service, by a member of a handle such as `mail.send`, by reading a secret, and by `start` and `emit`. Reading a definition or a member does no work and raises nothing: `slack.postMessage` is a value that carries its name.

A setting is a value: read with no engine it answers its record, `{ setting: 'shopName' }`, which is worked out when the definition is carried out.

## The fix

Run the code inside an engine. In a test of a part, hand a runtime to `setRuntime` of `tentjs/core`, and empty the slot again with `setRuntime(null)`.

## See also

`topic.words`, `topic.errors`
