# `everywhere` of `change`

Answers the change only once every machine of the app holds it.

## Value

True or false. False when left out.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  everywhere: true,
})
```

## See also

`word.change`
