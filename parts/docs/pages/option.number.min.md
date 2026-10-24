# `min` of `number`

The smallest number that is taken.

## Value

A number. A smaller one is refused, and the field fails the check `min`. Left out, the number has no lower bound.

## Example

```ts
total: number({ min: 0 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.number`, `topic.types`
