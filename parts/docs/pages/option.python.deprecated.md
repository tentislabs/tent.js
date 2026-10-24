# `deprecated` of `python`

Marks it as going away, in the API description and in its answers.

## Value

A day, as `'2027-01-01'`. Left out, it stays.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  deprecated: '2027-01-01',
})
```

## See also

`word.python`
