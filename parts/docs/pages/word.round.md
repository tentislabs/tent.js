# `round`

Rounds a number, to so many digits after the point where they are given.

## Example

```ts
const gross = round(order.total * 1.2, 2)
```

## Returns

`Math.round(n * 10 ** digits) / 10 ** digits`, with `digits` 0 when left out. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.floor`, `word.ceil`
