# `most`

The largest of two or more values: numbers, or days, or moments, all of one kind.

## Example

```ts
const fee = most(5, order.total * 0.02)
```

## Returns

The largest value, in its kind. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.least`, `word.max`
