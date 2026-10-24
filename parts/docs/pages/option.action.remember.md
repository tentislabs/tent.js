# `remember` of `action`

Keeps the answers of the action for the same input.

## Value

`true`, which keeps for 30 days, or `{ for, kind, version, shared }`. Left out, nothing is kept.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  remember: { for: '30 days', kind: false, version: 'v2', shared: 'the same for everyone' },
})
```

## See also

`word.action`
