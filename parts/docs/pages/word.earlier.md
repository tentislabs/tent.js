# `earlier`

Moves a moment or a day earlier by a length of time.

## Example

```ts
const cutoff = earlier(now, '30 days')
```

## Returns

The moment or the day, in the kind it was handed, and nothing for nothing. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

`code.T1011`: a length that is written and does not read, when the project is described.

## See also

`topic.values`, `word.later`, `word.between`
