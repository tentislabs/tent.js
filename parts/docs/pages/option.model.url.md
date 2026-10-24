# `url` of `model`

The address of the provider.

## Value

An address. It is required for `'openai-style'`. Left out, the provider's own address holds.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  url: 'https://models.example.com',
})
```

## See also

`word.model`
