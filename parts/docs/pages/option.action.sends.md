# `sends` of `action`

Whether the action sends data out.

## Value

True or false. `false` is the builder's word that it sends nothing. Left out, an action whose `run` is code sends, and a plain action sends when what it calls sends: `mail.send`, a call of a service that does not state `sends: false`, or a function, a flow or a model that sends. A person is asked before an agent runs one that sends, unless its `trust` names it.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  sends: false,
})
```

## See also

`word.action`
