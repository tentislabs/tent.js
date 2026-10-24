# `whole` of `number`

Holds the number to whole numbers.

## Value

True or false. With true a number with a decimal part is refused, and the field fails the check `type`. False when left out.

## Example

```ts
qty: number({ whole: true })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.number`, `topic.types`
