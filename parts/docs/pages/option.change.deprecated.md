# `deprecated` of `change`

Marks the change as going away, in the API description and in its answers.

## Value

A day, as `'2027-01-01'`. Left out, the change stays.

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  deprecated: '2027-01-01',
})
```

## See also

`word.change`
