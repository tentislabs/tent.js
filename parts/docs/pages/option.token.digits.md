# `digits` of `token`

How many digits the token is, in place of the 43 characters that are safe in an address.

## Value

A whole number from 1 up, each digit drawn evenly, as for a code sent by mail. Left out, the token is 43 characters.

## Example

```ts
const code = token({ digits: 6 })
```

## Errors

`code.T0027`: `digits` that is no whole number from 1 up, or more digits than the limit `valueSize` lets a value hold.

## See also

`word.token`
