# `uses` of `action`

The functions, service calls and members of handles that the code asks the writer for.

## Value

A list of them, each as it was imported. Left out, the code states none.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  uses: [countNotes, hooks.status],
})
```

## See also

`word.action`
