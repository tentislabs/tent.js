# `runs` of `evals`

How many times each case runs.

## Value

A whole number. Left out, 1. A model answers otherwise from one run to the next, so a case that runs several times says how often it holds.

## Example

```ts
const result = await evals(app, 'helper', list, { runs: 5 })
```

## See also

`word.evals`, `option.evals.pass`
