# `worker` of `python`

The kind of worker it runs on.

## Value

The name of a kind of `workers` of the project, or `'any'`. Left out, it runs in this program.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  worker: 'gpu',
})
```

## See also

`word.python`
