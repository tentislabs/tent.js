# `contains`

Says whether a text holds a part, where capitals of the 26 plain letters do not count, or whether a list holds a value.

## Example

```ts
const late = contains(order.note, 'late')
```

## Returns

True or false. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.startsWith`
