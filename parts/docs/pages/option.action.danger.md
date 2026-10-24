# `danger` of `action`

Whether AIs and MCP callers ask a person before the action runs.

## Value

`'none'` or `'ask'`. `'none'` when left out. As a tool of an agent, an action that asks makes the run wait for a person's yes before each call: the ask that a page shows of the run (`option.agent.tools`).

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  danger: 'ask',
})
```

## See also

`word.action`
