# `plain` of `change`

Holds the change to the plain form.

## Value

`true`. What would make it code is then an error on that line. Left out, its `run` may be code.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  plain: true,
})
```

## See also

`word.change`
