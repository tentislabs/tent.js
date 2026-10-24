# `batch` of `python`

Gathers calls into one.

## Value

`{ max, wait, measure, split }`. Left out, each call runs by itself.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  batch: { max: 32 },
})
```

## See also

`word.python`
