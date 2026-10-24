# `output` of `model`

What the model gives, for a model that is called as a function.

## Value

A type. Left out, the model is no function.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  output: object({ picture: file() }),
})
```

## See also

`word.model`
