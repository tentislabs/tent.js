# `key` of `model`

The key the provider is called with.

## Value

A secret, written `secret('NAME')`. Left out, the provider is called with none.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
})
```

## See also

`word.model`
