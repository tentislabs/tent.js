# `system` of `action`

Gives the action full access, with the reason.

## Value

Text that says why the action needs every row: it is read by whoever reads the code, and `tent access` shows it. Left out, the action reads as its caller.

An action is written with `run`. Full access there is `db.system`, the tables with every row, whatever the rules of the tables say, and `db` beside it stays limited to the caller. Both answer a promise in an action. `db.system` in an action that states no `system` is `code.T3004`. The `access` of the action holds either way: it says who may call, and `system` only what the call may reach.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  system: 'sends to the people of every team',
  input: { team: link('teams') },
  run: async ({ input, db }) => {
    const people = await db.system.members.where({ team: input.team }).all()
    return { sent: people.length }
  },
})
```

## See also

`word.action`, `topic.db`, `code.T3004`
