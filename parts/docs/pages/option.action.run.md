# `run` of `action`

The function that does the work.

## Value

A function that is handed `{ input, user, db, about }` and may be async. Its `db` reads, as promises. It is required.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
})
```

## See also

`word.action`
