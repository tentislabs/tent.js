# `max` of `number`

The largest number that is taken.

## Value

A number. A larger one is refused, and the field fails the check `max`. Left out, the number has no upper bound.

## Example

```ts
discount: number({ max: 100 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.number`, `topic.types`
