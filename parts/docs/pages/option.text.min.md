# `min` of `text`

The fewest characters the text may have.

## Value

A number. A shorter text is refused, and the field fails the check `min`. Left out, empty text fits.

## Example

```ts
name: text({ min: 1 })
```

## Errors

`code.T0002`: a value of an input that does not fit it.

## See also

`word.text`, `topic.types`
