# `budget` of `evals`

The most of each unit the cases may use, after which the cases that are left are not run.

## Value

A record of numbers by unit, as `{ tokensOut: 100000 }`. A case that is not run counts in `notRun`. Left out, the cases share what is left of the budget of `tent test --ai`, which is one bound for the whole command: `--budget <unit>=<most>`, `tokensOut=500000` where it is not typed, and none with `--budget none`.

## Example

```ts
const result = await evals(app, 'helper', list, { budget: { tokensOut: 100000 } })
```

## See also

`word.evals`, `command.test`
