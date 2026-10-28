# `random`

A number from 0 up to, and not with, 1. It may stand in a change, a seed, an action and inside a step, and in no query.

## Example

```ts
set: orders.change(input('order'), { lucky: calc('<', random(), 0.5) })
```

## Returns

The number, which it asks the engine for. In a test app it is drawn from the source of the test's random seed, so a test draws the same numbers on every computer (`option.testApp.randomSeed`). Where a definition is being made it answers its record, `{ "random": true }`.

## See also

`topic.values`, `word.token`, `option.testApp.randomSeed`
