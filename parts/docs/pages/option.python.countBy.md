# `countBy` of `python`

For whom its calls are counted.

## Value

`'caller'` or `'limits'`. Left out, the project's `countBy` holds.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  countBy: 'limits',
})
```

## See also

`word.python`
