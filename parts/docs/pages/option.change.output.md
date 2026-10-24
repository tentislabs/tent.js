# `output` of `change`

The type of the answer.

## Value

A type. Left out, a change written with `run` answers nothing, whatever its `run` gives back, and one written with `set` the row of its write. The type of a call says the same: `await app.as(user).call(addOrder, {...})` of a change with `run` and no `output` is nothing.

To answer a row from a `run`, state its fields as an `object`: only what `output` names leaves the function. A change written with `run` that answers a record which code takes, and states no `output`, is `code.T7009`, which the check finds.

## Example

```ts
export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { customer: link('customers'), total: number({ min: 0, whole: true }) },
  output: object({ id: link('orders'), total: number(), placedBy: link('users') }),
  run: ({ input, db, user }) => db.orders.add({ customer: input.customer, total: input.total, placedBy: user?.id }),
})
```

## Errors

`code.T7009`: a change written with `run` answers a record that code takes, and states no `output`.

## See also

`word.change`
