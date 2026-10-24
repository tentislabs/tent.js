# `about` of `python`

One sentence on what it is for.

## Value

Text. Left out, it has no sentence.

What it holds is told to everyone a tool is shown to: the model of every starter alike, the list of MCP, and the docs of the API. So it holds nothing secret.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  about: 'How likely a team is to leave',
})
```

## See also

`word.python`
