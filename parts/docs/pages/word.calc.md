# `calc`

Works out one sign of arithmetic or of comparing: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`. It is the sign it names and nothing more, for a form written with values: a body and a view write the sign itself.

## Example

```ts
rows: orders.skip(calc('*', input('page'), 20)).limit(20)
```

## Returns

What JavaScript works out for the sign. Handed a reference it answers its record, `{ "calc", "left", "right" }`.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

## See also

`topic.values`
