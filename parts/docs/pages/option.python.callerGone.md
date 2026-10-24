# `callerGone` of `python`

What becomes of the work when its caller is gone.

## Value

`'goOn'` or `'stop'`. `'goOn'` when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  callerGone: 'goOn',
})
```

## See also

`word.python`
