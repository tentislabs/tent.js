# `units` of `model`

Where the answer of the service says what was used.

## Value

A record from a unit to a dotted path into the answer, or to a fixed number for each call. Left out, only `calls` is counted.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  units: { tokensIn: 'usage.input_tokens' },
})
```

## See also

`word.model`
