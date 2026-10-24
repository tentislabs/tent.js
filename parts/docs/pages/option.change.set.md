# `set` of `change`

The writes of the change, as plain data.

## Value

One write or a list of writes, made from a table. One of `set` and `run` is required.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
})
```

## See also

`word.change`
