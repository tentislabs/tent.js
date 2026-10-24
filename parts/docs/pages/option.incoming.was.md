# `was` of `incoming`

The old name of the incoming call, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  verify: hooks.signature,
  was: 'events',
})
```

## See also

`word.incoming`
