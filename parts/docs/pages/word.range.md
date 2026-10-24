# `range`

A list of numbers that starts at one number and lies before another, by a step.

## Example

```ts
const marks = range(0, 500, 100)
```

## Returns

The numbers `from + i * by`, as long as they lie before `to`. `by` is 1 when left out, and below zero for a list that falls. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`
