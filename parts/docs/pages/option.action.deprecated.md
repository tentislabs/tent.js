# `deprecated` of `action`

Marks the action as going away, in the API description and in its answers.

## Value

A day, as `'2027-01-01'`. Left out, the action stays.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  deprecated: '2027-01-01',
})
```

## See also

`word.action`
