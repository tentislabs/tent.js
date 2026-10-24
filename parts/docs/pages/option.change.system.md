# `system` of `change`

Gives the change full access, with the reason.

## Value

Text that says why the change needs every row: it is read by whoever reads the code, and `tent access` shows it. Left out, the change writes as its caller.

Full access means that the rules of the tables do not hold: the change reaches every row, whatever `access` of a table says. How it is used depends on how the change is written:

- Written in our own words, with `set`, the whole plan or write is carried out with full access.
- Written with `run`, full access is `db.system`, and `db` beside it stays limited to the caller. So one `run` reads what the caller may see through `db`, and what it must see beyond that through `db.system`.

`db.system` in a change that states no `system` is `code.T3004`. The rule of the change itself, its `access`, holds either way: it says who may call, and `system` only what the call may reach.

## Example

```ts
export const closeDay = change('closeDay', {
  access: role('staff'),
  system: 'closes the orders of every customer',
  input: { order: link('orders') },
  set: orders.change(input('order'), { status: 'closed' }),
})
```

## See also

`word.change`, `topic.db`, `code.T3004`
