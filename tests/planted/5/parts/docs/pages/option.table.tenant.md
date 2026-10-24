# `tenant` of `table`

Keeps the rows of a table in a data file for each tenant.

## Value

The name of the column that names the tenant. Where it is not given, all rows lie in one file.

## Example

```ts
export const orders = table('orders', { team: text }, { tenant: 'team' })
```

## See also

`word.table`
