# `least`

The smallest of two or more values: numbers, or days, or moments, all of one kind.

## Example

```ts
const due = least(order.due, later(now, '7 days'))
```

## Returns

The smallest value, in its kind. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.most`, `word.min`
