# `changes` of `action`

The builder's word on whether the action writes in the store.

## Value

`false` says that it writes nothing, so a reader carries it out itself. Left out, it is the writer's.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  changes: false,
})
```

## See also

`word.action`
