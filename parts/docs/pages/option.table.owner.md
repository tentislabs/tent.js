# `owner` of `table`

The column that says whose row it is.

## Value

The name of a column that links to `users`. It is filled with the caller when a user adds a row and does not give it. Left out, the table has no owner.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  owner: 'placedBy',
})
```

## See also

`word.table`
