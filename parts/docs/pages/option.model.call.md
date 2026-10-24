# `call` of `model`

The call of a service that the model is made of, with the provider `service`.

## Value

A call of a service, as `decisions.decide`. It is required for that provider.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  call: hooks.decide,
})
```

## See also

`word.model`
