# `input` of `model`

What the model takes, for a model that is called as a function.

## Value

A record of types. Left out, the model is no function.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  input: { prompt: text() },
})
```

## See also

`word.model`
