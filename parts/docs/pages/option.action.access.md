# `access` of `action`

Who may call the action.

## Value

A rule. It is required: there is no default.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
})
```

## See also

`word.action`
