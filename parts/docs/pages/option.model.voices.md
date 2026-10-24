# `voices` of `model`

The voices of a model that speaks.

## Value

A list of names, of which the first is its default. Left out, the list of known models says.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  voices: ['calm'],
})
```

## See also

`word.model`
