# `touches` of `change`

The tables that a raw SQL write of the change writes.

## Value

A list of tables. Left out, they are worked out where the change is plain.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  touches: [notes],
})
```

## See also

`word.change`
