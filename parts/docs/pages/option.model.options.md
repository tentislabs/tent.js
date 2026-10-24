# `options` of `model`

What is passed straight to the provider.

## Value

A record. Left out, nothing is passed. `reasoning` here, where a provider takes it as OpenAI does, is that provider's own option for how the model reasons, handed on as it is; what the model writes of its reasoning is shown or saved by `reasoning` of an agent (`option.agent.reasoning`).

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  options: { temperature: 0 },
})
```

## See also

`word.model`, `option.agent.reasoning`
