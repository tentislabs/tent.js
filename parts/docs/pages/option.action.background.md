# `background` of `action`

Runs the action off the main thread.

## Value

`true`, or `'here'` for a thread of this program always. False when left out.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  background: true,
})
```

## See also

`word.action`
