# `input` of `change`

The fields that a call gives.

## Value

A record of types. Left out, the change takes nothing.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  input: { body: text() },
})
```

## See also

`word.change`
