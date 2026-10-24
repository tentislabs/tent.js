# `where`

One word with two uses, which both mean the rows that fit a filter. Handed a list and a filter it is a value word, and handed a filter alone, or an arrow over the user and `db`, it is the rule of a table.

## Example

```ts
const big = where(rows, { total: { above: 100 } })
```

## Returns

As a value word: the rows of the list that fit, judged by the rules of a plan's filter, from a row's own fields alone. As a rule: the record of the rule, which lets a caller reach the rows that fit, with `caller('id')` for the caller: `access: { read: where({ placedBy: caller('id') }) }`.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`, `word.allow`, `word.given`
