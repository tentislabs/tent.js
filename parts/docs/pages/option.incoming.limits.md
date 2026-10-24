# `limits` of `incoming`

The limits of a call.

## Value

`{ size }`. Left out, the `callSize` of the project holds.

## Example

```ts
export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  verify: hooks.signature,
  limits: { size: '4 MB' },
})
```

## See also

`word.incoming`
