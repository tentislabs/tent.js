# `open` of `incoming`

Takes calls that nobody signed, with the reason.

## Value

Text that says why. One of `verify` and `open` is required.

## Example

```ts
export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  open: 'the sender signs nothing',
})
```

## See also

`word.incoming`
