# `access` of `python`

Who may call it.

## Value

A rule. It is required: there is no default.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
})
```

## See also

`word.python`
