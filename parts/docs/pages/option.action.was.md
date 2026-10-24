# `was` of `action`

The old name of the action, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  was: 'noteSend',
})
```

## See also

`word.action`
