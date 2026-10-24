# `was` of `model`

The old name of the model, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  was: 'author',
})
```

## See also

`word.model`
