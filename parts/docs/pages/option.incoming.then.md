# `then` of `incoming`

The flow that an incoming call starts.

## Value

A flow definition. It is required.

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
