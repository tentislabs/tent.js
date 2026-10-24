# `tenant` of `table`

The link column that says whose data file a row lives in.

## Value

The name of a required link column of the table that states `onRemove: 'remove'`. Left out, the rows live in the shared file.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  tenant: 'team',
})
```

## See also

`word.table`
