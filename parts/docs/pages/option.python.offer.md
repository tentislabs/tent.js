# `offer` of `python`

The outside doors it is offered to.

## Value

A list of `'api'`, `'mcp'` and `'cli'`. Left out, it is offered to none.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  offer: ['api'],
})
```

## See also

`word.python`
