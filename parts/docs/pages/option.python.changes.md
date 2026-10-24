# `changes` of `python`

The builder's word on whether it changes anything.

## Value

`false` says that it only works something out, which lets a screen read it. True when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  changes: false,
})
```

## See also

`word.python`
