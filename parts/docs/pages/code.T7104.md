# T7104 provider-failed

Every model that could answer a call failed, and the call fails with the status 502. The message names each model that was asked, with its reason.

## Details

A model is tried again where its server answered with an error of its own or said that it is too busy, as often as its `tries` allows, and the call then goes to the next model in `fallback` that has the ability. It fails with this code when none is left. It is also raised where:

- a part of the answer of a `stream` was already given, and the call failed after it: it is given to no second model;
- a long job was begun, and its checks failed, passed the model's `limits.time`, or met the `failed` of its `job`: the first server may still finish, so no second model is asked.

## The fix

Try again later, or list another model in `fallback`, at another provider.

```ts
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY'), fallback: [backup] })
```

## See also

`option.model.fallback`, `option.model.tries`, `option.model.job`
