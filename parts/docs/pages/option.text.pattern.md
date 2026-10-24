# `pattern` of `text`

A regular expression that the text must fit.

## Value

Text that holds the expression, which the text must fit somewhere: `^` and `$` hold it to the start and the end. A text that does not fit is refused, and the field fails the check `pattern`. Left out, every text fits.

## Example

```ts
code: text({ pattern: '^[A-Z]{3}$' })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.text`, `topic.types`
