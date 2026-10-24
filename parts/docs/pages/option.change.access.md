# `access` of `change`

Who may call the change.

## Value

A rule. It is required: there is no default.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
})
```

## See also

`word.change`
