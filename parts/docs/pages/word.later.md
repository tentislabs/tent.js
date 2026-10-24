# `later`

Moves a moment or a day later by a length of time. A moment is moved by the length as it is stored, and a day on the calendar.

## Example

```ts
const due = later(now, '7 days')
```

## Returns

The moment or the day, in the kind it was handed, and nothing for nothing. A month later from the 31st of January is the last day of February. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

`code.T1011`: a length that is written and does not read, when the project is described.

## See also

`topic.values`, `word.earlier`, `word.between`
