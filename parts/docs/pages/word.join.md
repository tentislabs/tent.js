# `join`

Joins the entries of a list as one text, with a text between them.

## Example

```ts
const ids = join(each(rows, (o) => o.id), ', ')
```

## Returns

The text, each entry written as `concat` writes it. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.concat`
