# `output` of `action`

The type of the answer.

## Value

A type. Left out, the action answers nothing, whatever its `run` gives: a screen reads the `value` of `useCall` as nothing, and the type checker types it so. To hand a value back, state the type it has.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  output: object({ ok: boolean() }),
})
```

## See also

`word.action`
