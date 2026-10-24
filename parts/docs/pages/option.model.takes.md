# `takes` of `model`

The most tokens one request may hold.

## Value

A number. Left out, the list of known models says.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  takes: 200000,
})
```

## See also

`word.model`
