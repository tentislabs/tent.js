# `provider` of `model`

Who runs the model.

## Value

`'anthropic'`, `'openai'`, `'openai-style'`, `'google'`, `'service'`, or a provider of the builder's own. It is required.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
})
```

## See also

`word.model`
