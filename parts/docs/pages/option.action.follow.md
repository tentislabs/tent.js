# `follow` of `action`

Who may follow the runs of the action from a page.

## Value

A rule, in the form of `access`. Left out, nobody.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  follow: 'signedIn',
})
```

## See also

`word.action`
