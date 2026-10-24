# `fingerprint`

SHA-256 of a text's bytes as UTF-8, written as lowercase hex. It belongs to backend code, and is no word of a view.

## Example

```ts
const print = fingerprint(input.code)
```

## Returns

The fingerprint, 64 characters. Handed a reference it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.sameSecret`
