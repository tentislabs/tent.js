# `fallback` of `model`

The models that a call goes to when this one cannot answer.

## Value

A list of model definitions, tried in order. Left out, the call fails.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  fallback: [embedder],
})
```

## See also

`word.model`
