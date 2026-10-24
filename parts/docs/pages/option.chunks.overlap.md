# `overlap` of `chunks`

How much of the end of one chunk is repeated at the start of the next.

## Value

A whole number that is less than half of `size`. 150 when left out.

## Example

```ts
const parts = chunks(text, { size: 800, overlap: 100 })
```

## Errors

`code.T0002`: a value that is not allowed.

## See also

`word.chunks`
