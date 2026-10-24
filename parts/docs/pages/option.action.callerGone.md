# `callerGone` of `action`

What becomes of the work when its caller is gone.

## Value

`'goOn'` or `'stop'`. `'goOn'` when left out.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  callerGone: 'stop',
})
```

## See also

`word.action`
