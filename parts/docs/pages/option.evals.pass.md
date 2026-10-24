# `pass` of `evals`

The share of its runs a case needs to pass.

## Value

A number from 0 to 1. Left out, 0.8.

## Example

```ts
const result = await evals(app, 'helper', list, { runs: 5, pass: 0.6 })
```

## See also

`word.evals`, `option.evals.runs`
