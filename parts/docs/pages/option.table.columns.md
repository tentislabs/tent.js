# `columns` of `table`

The columns of the table, each a type by its name.

## Value

A record of types. It is required, but for a table that states `shows`. Every table has `id`, `createdAt` and `updatedAt` by itself. The name of a column is camelCase letters and digits. A column that states `from` is worked out by the store from the columns of its own row.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
})
```

## Errors

`code.T1013`: a column whose name is not camelCase letters and digits.

`code.T1009`: a column under a reserved name.

`code.T1014`: a `from` that the store cannot work out or keep.

## See also

`word.table`
