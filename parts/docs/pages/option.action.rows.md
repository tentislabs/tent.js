# `rows` of `action`

Plans whose rows the action is handed.

## Value

A record of plans by name. Each is carried out as the caller before the call. Left out, the action is handed no rows.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  rows: { notes: notes.where({ body: input('note') }) },
})
```

## See also

`word.action`
