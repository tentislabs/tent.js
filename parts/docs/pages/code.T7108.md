# T7108 answer-did-not-fit

The answer of a model did not fit its type: the status 500. The message says which field did not fit, and why.

## Details

- The answer to a `fill` is checked against its shape. One that does not fit is asked for once more, with the error, and a second miss fails with this code.
- The answer of a model that is a function is checked against its `output`.
- A `stream` with a `shape` ends with it, after the parts that were given, where its last answer does not fit.

## The fix

Write a shape the model can fill, with fewer and plainer fields, or ask a model that keeps to it.

```ts
const { score } = await writer.fill({ score: number({ min: 0, max: 1 }) }, `How well does this keep the rule? ${text}`)
```

## See also

`word.model`, `option.model.output`
