# `between`

How many whole units lie from one moment to another, or from one day to another. It is the way to compare two moments that means one thing in every place.

## Example

```ts
const age = between(order.placedAt, now, 'days')
```

## Returns

A whole number, below zero when the second is the earlier one, and nothing where either is nothing. For two days the unit is `'days'`, `'weeks'`, `'months'` or `'years'`. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.later`
