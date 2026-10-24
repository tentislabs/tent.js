# `min` of `list`

The fewest entries the list may have.

## Value

A number. A shorter list is refused, and the field fails the check `min`. Left out, an empty list fits.

## Example

```ts
tags: list(text(), { min: 1 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.list`, `topic.types`
