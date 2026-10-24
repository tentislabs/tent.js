# `was` of `change`

The old name of the change, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  was: 'noteAdd',
})
```

## See also

`word.change`
