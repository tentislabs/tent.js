# `atOnce` of `python`

How many calls one loaded copy is handed at the same time.

## Value

A number. 1 when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  atOnce: 2,
})
```

## See also

`word.python`
