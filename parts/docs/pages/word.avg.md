# `avg`

The mean of the numbers of a list, or of one field of each entry. An entry that holds nothing is passed over and not counted.

## Example

```ts
const mean = avg(rows, 'total')
```

## Returns

The mean, and nothing for an empty list. Handed one text and nothing else, it answers what `group` takes for a column. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.sum`
