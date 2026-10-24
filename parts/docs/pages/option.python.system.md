# `system` of `python`

Gives it full access, with the reason.

## Value

Text that says why. Left out, it reads as its caller.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  system: 'reads every team',
})
```

## See also

`word.python`
