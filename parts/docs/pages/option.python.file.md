# `file` of `python`

The Python file that holds the code.

## Value

The path of a `.py` file of the project, which holds one `run`. It is required.

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
