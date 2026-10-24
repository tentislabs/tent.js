# `offer` of `change`

The outside doors the change is offered to.

## Value

A list of `'api'`, `'mcp'` and `'cli'`. Left out, it is offered to none.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  offer: ['api'],
})
```

## See also

`word.change`
