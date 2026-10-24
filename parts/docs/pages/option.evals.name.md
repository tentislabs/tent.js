# `name` of `evals`

The name the results are kept under, by which `tent test --ai --compare` matches them with earlier ones.

## Value

A text. Left out, the name of the target.

## Example

```ts
const result = await evals(app, 'helper', list, { name: 'helper in Turkish' })
```

## See also

`word.evals`, `command.test`
