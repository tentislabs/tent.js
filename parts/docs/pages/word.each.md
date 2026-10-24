# `each`

Makes a new list of what an arrow gives for each entry of a list. The arrow holds what a body may hold, and a `return` inside it ends the arrow.

## Example

```ts
const lines = each(rows, (o, i) => ({ place: i + 1, id: o.id }))
```

## Returns

The new list, in order. Where waiting is allowed and the arrow answers a promise, the entries are taken one after another, and it answers a promise of the list.

## Errors

`code.T0013`: an arrow that answers a promise where waiting is not allowed.

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

`code.T1014`: a reference in the place of its list: it takes an arrow, which only a body and a view can hold.

## See also

`topic.values`
