# `plain` of `table`

Holds the table to the plain form.

## Value

`true`. What would make a rule of it code is then an error on that line. Left out, a rule may be code.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  plain: true,
})
```

## See also

`word.table`
