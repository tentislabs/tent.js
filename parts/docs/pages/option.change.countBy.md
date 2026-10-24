# `countBy` of `change`

For whom the calls of the change are counted.

## Value

`'caller'` or `'limits'`. Left out, the project's `countBy` holds.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  countBy: 'limits',
})
```

## See also

`word.change`
