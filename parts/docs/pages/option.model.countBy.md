# `countBy` of `model`

Counts the calls of the model for the app and not for each caller.

## Value

`'app'`, on a model that states no `perCallerPerDay`. Left out, the model is counted by caller.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  countBy: 'app',
})
```

## See also

`word.model`
