# `max` of `text`

The most characters the text may have.

## Value

A number. A longer text is refused, and the field fails the check `max`. Left out, the text has no upper bound.

## Example

```ts
name: text({ max: 200 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.text`, `topic.types`
