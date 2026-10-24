# `access` of `table`

Who may read, add, change and remove rows.

## Value

`{ read, add, change, remove }`, each a rule. A rule that is left out means `'nobody'`.

A rule of `'signedIn'` is worth what the app's own sign-up lets in: where anyone may sign up, it lets in anyone who cares to. The engine holds no sign-up of its own, so who may make an account is the code of the project (`topic.signIn`).

A rule made with `where` lets a caller reach the rows that fit its filter, for a write as for a read. `add` holds the new row against the filter of the `add` rule: the row is added where it fits, and refused with `code.T3101` where it does not. `change` and `remove` first find the row with the rule as a filter: a row that does not fit is not found for the caller, and the call fails. So a caller writes the rows that the filter gives them, and no other, with no `system` and no check by hand.

A change that states `system` and writes through `db.system` passes every rule, and holds nothing against the caller but what its code checks. Where a rule can say who may write a row, write it with the rule, and keep `system` for what no rule can say. `tent check` reports a change open to callers that skips the rules of a row it names, with no check of the caller against it, as `code.T3009`.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  access: { read: where({ placedBy: 'u1' }), add: 'signedIn', change: 'owner', remove: role('staff') },
})

// A renter tells of their own rents alone: the rule finds the row, and refuses every other.
export const rents = table('rents', {
  columns: { renter: link('users'), month: text(), status: choice(['due', 'told', 'paid']) },
  access: { read: where({ renter: caller('id') }), change: where({ renter: caller('id') }) },
})
```

## See also

`word.table`, `word.where`, `code.T3009`, `topic.signIn`
