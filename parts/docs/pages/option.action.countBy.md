# `countBy` of `action`

For whom the calls of the action are counted.

## Value

`'caller'` or `'limits'`. Left out, the project's `countBy` holds.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  countBy: 'caller',
})
```

## See also

`word.action`
