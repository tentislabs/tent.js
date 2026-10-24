# `keepHistory` of `table`

Whether old versions of rows are kept.

## Value

True or false. False when left out.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  keepHistory: true,
})
```

## See also

`word.table`
