# `sends` of `python`

Whether it sends data out.

## Value

True or false. `false` is the builder's word that it sends nothing. True when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  sends: false,
})
```

## See also

`word.python`
