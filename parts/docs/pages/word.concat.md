# `concat`

Joins values as one text. It is a value word: it works a value out of the values it is handed, and means the same in every place a value may stand.

## Example

```ts
fullName: text({ from: concat(col('first'), ' ', col('last')) })
```

## Returns

The text: a number as JavaScript writes it, a moment in the standard form, and nothing as empty text. A list it is handed is written as JavaScript writes it, with commas between its entries, and is joined to no other list: `join` writes the entries of a list with a text between them. Handed a reference it answers its record, `{ "concat": [...] }`.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.join`
