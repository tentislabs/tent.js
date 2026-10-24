# T7003 limits-incomplete

A limit that is stated can never bound, so a run or a model could use without end. The check finds it, and the app is not built.

## Details

- A limit that names no unit: `perDay: {}`, `perCallerPerDay: {}`, `perRun: {}`.
- A limit that names a unit which nothing in the project counts, where every model of the project is of a provider that ships or over a service call: the units of the fixed calls are `calls`, `failed`, `tokensIn`, `tokensOut`, `tokensCached`, `tokensStored`, `seconds` and `characters`, beside the keys of `units` of each model over a service call, and of a run also `workSeconds`, `lostSeconds`, `cpuMs`, `mainCpuMs` and `workedMs`. A provider of the builder's own may report any unit, so with one in the project the names are not held.
- `units` of a model over a service call that names a unit of the engine's own, such as `bytesOut`.
- `countBy: 'app'` on a model that states `perCallerPerDay`: such a model is counted with no caller.

## The fix

Name a unit that is counted, with its most, or leave the limit out.

```ts
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
```

## See also

`option.model.limits`, `option.agent.limits`, `code.T7102`
