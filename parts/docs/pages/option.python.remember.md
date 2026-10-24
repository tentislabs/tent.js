# `remember` of `python`

Keeps the answers for the same input.

## Value

`true`, which keeps for 30 days, or `{ for, kind, version, shared }`. Left out, nothing is kept.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  remember: true,
})
```

## See also

`word.python`
