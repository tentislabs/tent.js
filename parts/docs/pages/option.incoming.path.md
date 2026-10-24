# `path` of `incoming`

The address the call arrives at.

## Value

A pattern like a route's, as `'/hooks/stripe'`. It is required.

## Example

```ts
export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  verify: hooks.signature,
})
```

## See also

`word.incoming`
