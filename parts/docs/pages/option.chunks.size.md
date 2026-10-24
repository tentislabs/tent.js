# `size` of `chunks`

The most a chunk may hold.

## Value

A whole number from 1 up, counted as JavaScript counts the length of a text. A chunk is never cut inside a character. 1200 when left out.

## Example

```ts
const parts = chunks(text, { size: 800 })
```

## Errors

`code.T0002`: a value that is not allowed.

## See also

`word.chunks`
