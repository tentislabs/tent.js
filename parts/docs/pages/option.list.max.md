# `max` of `list`

The most entries the list may have.

## Value

A number. A longer list is refused, and the field fails the check `max`. Left out, the list has no upper bound.

## Example

```ts
tags: list(text(), { max: 10 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.list`, `topic.types`
