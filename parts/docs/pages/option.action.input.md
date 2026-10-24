# `input` of `action`

The fields that a call gives.

## Value

A record of types. Left out, the action takes nothing.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  input: { note: text() },
})
```

## See also

`word.action`
