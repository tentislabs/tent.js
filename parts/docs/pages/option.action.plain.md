# `plain` of `action`

Holds the action to the plain form.

## Value

`true`. What would make it code is then an error on that line. Left out, its `run` may be code.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  plain: true,
})
```

## See also

`word.action`
