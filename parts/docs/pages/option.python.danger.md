# `danger` of `python`

Whether AIs and MCP callers ask a person before it runs.

## Value

`'none'` or `'ask'`. `'none'` when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  danger: 'ask',
})
```

## See also

`word.python`
