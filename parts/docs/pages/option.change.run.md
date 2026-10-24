# `run` of `change`

The function that makes the change.

## Value

An ordinary function, not an async one, that is handed `{ input, db, user, now }`. The whole of it is one all-or-nothing write. One of `set` and `run` is required.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  run: ({ input }) => input.body,
})
```

## See also

`word.change`
