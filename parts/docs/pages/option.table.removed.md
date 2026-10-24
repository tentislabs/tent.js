# `removed` of `table`

The columns that were removed on purpose.

## Value

A list of column names. Left out, a column that is gone is reported.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  removed: ['oldColumn'],
})
```

## See also

`word.table`
