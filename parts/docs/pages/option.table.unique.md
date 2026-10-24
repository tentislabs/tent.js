# `unique` of `table`

Sets of columns whose values together may stand once.

## Value

A list of column lists. Left out, no set of columns is held unique.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  unique: [['note']],
})
```

## See also

`word.table`
