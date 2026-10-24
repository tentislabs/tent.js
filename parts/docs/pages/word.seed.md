# `seed`

The starter data of a project, which the file `seed.ts` exports as its default. It is applied to data that is empty: by `tent start --seed`, by `app.seed()`, and for every test app.

## Example

```ts
import { seed } from 'tentjs'
import { customers } from './tables/customers'

export default seed([customers.add({ name: 'Maya' }), customers.add({ name: 'Sam' })])
```

A list of writes cannot link a row to a row that the same list adds, since the id of a row is made when it is added. For that, the seed is an arrow:

```ts
import { seed } from 'tentjs'

export default seed(({ db, now }) => {
  const maya = db.customers.add({ name: 'Maya' })
  db.orders.add({ customer: maya.id, total: 1999, placedAt: now })
  db.orders.add({ customer: maya.id, total: 4250, placedAt: now })
})
```

## Options

`seed` takes one thing: a list of writes, as a table gives them (`customers.add({...})`), or an arrow.

The arrow is handed `{ db, call, now }`:

| Name | Is |
|---|---|
| `db` | The tables of the project, with full access: no rule of a table holds in a seed. It reads and writes, and answers at once, as in a change: `db.customers.add({...})` answers the row, with its `id`, and needs no `await` (`topic.db`) |
| `call` | Calls a function of the project, as the system |
| `now` | The moment the seed is applied |

The arrow may be `async`, where it waits for something of its own, as a `call` of an action.

The seed runs in the program that holds the engine, and a file it reads by a path that is no whole one is read from the working folder of that program: the folder that `tent start` or `tent dev` was typed in, and for a test app the folder of the project, where `tent test` runs each test file. A bundle holds no file of the project but what the build put in it, so a seed that reads files of its own is applied where they lie beside it.

A seed that fails ends with its failure: `tent start --seed` ends, `app.seed()` is refused, and the log of the app holds it. What the code of the seed threw is `code.T0009`, with the words of the failure; a failure of the engine, as a row that a table refuses, stays what it is. Each write that the seed made before it failed stands.

## Returns

The record of the starter data: a list of writes, or an arrow.

## See also

`topic.words`, `topic.db`, `topic.users`, `command.start`
