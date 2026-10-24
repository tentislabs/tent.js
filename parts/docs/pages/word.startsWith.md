# `startsWith`

Says whether a text starts with a part, as the filter operator of that name does: capitals of the 26 plain letters do not count.

## Example

```ts
const isDraft = startsWith(order.note, 'draft')
```

## Returns

True or false. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.contains`
