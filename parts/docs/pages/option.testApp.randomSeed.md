# `randomSeed` of `testApp`

The seed of every number the app draws in the test.

## Value

A text. `random()`, `token()`, `step.random()`, the ids of the rows the app adds, and `Math.random()` in the app's own code are drawn from a source made from it, so the same test draws the same numbers on every computer, and a test that draws otherwise holds another seed. Left out, under `tent test`, it is the name of the test that runs. A failing test prints its random seed: a test app opened with that seed draws the same numbers again, and fails the same way. The word is that of `--test-random-seed` of the runtime's runner and of `seed` in fast-check and Hypothesis, whole, since `seed` alone names the starter data.

## Example

```ts
const app = await testApp({ randomSeed: 'a refund twice' })
```

## See also

`word.testApp`, `option.testApp.clock`, `word.random`, `word.token`, `topic.tests`
