# `was` of `python`

Its old name, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  was: 'churnScore',
})
```

## See also

`word.python`
