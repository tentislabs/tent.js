# `worker` of `action`

The kind of worker the action runs on.

## Value

The name of a kind of `workers` of the project, or `'any'`. Left out, it runs in this program.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  worker: 'gpu',
})
```

## See also

`word.action`
