# `db`: the rows of the app, in code

A function written with `run` is handed `db`: the tables of the project, each by its name, under the rules of the caller.

```ts
export const orderOf = query('orderOf', {
  access: 'signedIn',
  input: { id: text() },
  run: ({ input, db }) => db.orders.get(input.id),
})
```

## What it is handed, and where

| In the `run` of | `db` | Answers |
|---|---|---|
| a query | reads | at once: no `await`, and the `run` is not `async` |
| a change | reads and writes | at once: no `await`, and the `run` is not `async` |
| an action | reads | a promise: each read is awaited, `await db.orders.get(id)`. An action writes by calling a change |
| the arrow of a seed | reads and writes, with full access | at once |

A query and a change answer at once because each is one reading or one write of the data, with nothing waited for in the middle. An `await` there, or an `async` `run`, is `code.T4005`.

## Reading

`db.<table>` has the members of a plan (`topic.plans`): `where`, `search`, `near`, `group`, `with`, `pick`, `newest`, `oldest`, `sort`, `limit`, `skip`, `after`. A plan in code is ended by the member that carries it out:

| Member | Answers |
|---|---|
| `.all()` | The rows, as a list |
| `.first()` | The first row, or nothing |
| `.count()` | A number |
| `db.<table>.get(id)` | The row of that id, or nothing. It needs no end |
| `db.<table>.count(filter)` | A number |
| `db.<table>.history(id)` | Each state the row had |

A plan that is not ended is no rows, and the type checker says so in many words. `tent check` then reports `code.T8000` with `TS2740` or `TS2322`, of a type `DbChain<...>` that "is missing the following properties from type 'readonly unknown[]'", often at the screen that reads the query and not at the query. What it means: write `.all()` or `.first()` at the end of the plan.

A row is handed as code holds it: a `date` is a `Date`, a link is the id of the linked row as text, and with `.with('customer')` the linked row itself.

## Writing

In a change and in the arrow of a seed:

```ts
const order = db.orders.add({ customer: input.customer, total: input.total })
db.orders.change(order.id, { status: 'paid' })
db.orders.remove(order.id)
```

`add` and `change` answer the row as it is after the write, with its `id`, `createdAt` and `updatedAt`. A value that is left out takes the default of its column, and `null` clears a column.

## The rules of the caller, and `db.system`

`db` reads and writes as the caller of the function: the `access` of each table holds, so a caller is answered the rows they may read and nothing else, and a write they may not make fails with `code.T3101`.

`db.system` is the same tables with full access: every row, whatever the rules say. A function may use it only where it states `system: 'why'`, a text that says why it needs every row (`option.query.system`); without that, `tent check` reports `code.T3004`. `db` beside it stays limited to the caller.

```ts
export const ordersOfTheDay = query('ordersOfTheDay', {
  access: role('staff'),
  system: 'the staff see the orders of every customer',
  run: ({ db }) => db.system.orders.where({ status: 'open' }).with('customer').all(),
})
```

## See also

`topic.plans`, `option.query.run`, `option.change.run`, `option.action.run`, `option.query.system`, `word.seed`, `code.T3004`, `code.T4005`
