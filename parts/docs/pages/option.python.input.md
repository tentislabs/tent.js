# `input` of `python`

The fields that a call gives.

## Value

A record of types. It is required.

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
