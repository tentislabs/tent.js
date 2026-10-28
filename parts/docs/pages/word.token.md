# `token`

A new secret text from the runtime's own random source, or so many digits. It may stand in a change, a seed, an action and inside a step, and in no query.

## Example

```ts
const code = token({ digits: 6 })
```

## Options

| Option | Means |
|---|---|
| `option.token.digits` | How many digits the token is, in place of the 43 characters that are safe in an address. |

## Returns

43 characters that are safe in an address, or with `{ digits }` that many digits, each drawn evenly. It asks the engine: where a definition is being made it answers its record. In a test app it is drawn from the source of the test's random seed, so a test draws the same token on every computer (`option.testApp.randomSeed`).

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.sameSecret`, `option.testApp.randomSeed`
