# Plans: how rows are asked for

A plan says which rows are wanted. A table gives one, each member answers a new plan, and nothing is read until the plan is carried out.

```ts
orders
  .where({ status: 'open', total: { above: 1000 } })
  .with('customer')
  .newest('placedAt')
  .limit(20)
```

## Where a plan starts

A table starts a plan with one of these.

| Member | Takes | Answers when it is carried out |
|---|---|---|
| `where(filter)` | A filter (below) | The rows that fit |
| `get(id)` | The id of a row | That row, or nothing where no row has the id or the caller may not read it |
| `search(text)` | Words | The rows whose `search` columns hold the words, the best first. The table states `search` |
| `near(column, vector, { measure, within })` | A vector column and a vector | The rows nearest to the vector, each with its `distance`. It needs a `limit` |
| `count(filter)` | A filter, or nothing | A number |
| `group(by, values)` | A column or a list of columns, and a record of sums | One record for each group: `orders.group('status', { total: sum('total'), n: count() })` |
| `history(id)` | The id of a row | In code alone: each state the row had, as `{ at, by, value }`. The table states `history` |

## What a plan can do

Each member answers a new plan, so they are written one after another.

| Member | Takes | Does |
|---|---|---|
| `where(filter)` | A filter | Narrows the rows. A second `where` narrows further |
| `with(column)` | The name of a link column | The row of the link comes with its row: `o.customer` is then the customer, and `o.customer.name` its name. Without `with`, a link holds the id of the linked row, as text. `with('customer.company')` follows a link of the linked row |
| `pick(columns)` | A list of column names | Only those columns |
| `newest(column)`, `oldest(column)` | A column | Sorts by a moment or a number, the newest or the oldest first |
| `sort(...columns)` | Column names | Sorts by each in turn. A minus before a name turns it round: `sort('status', '-total')` |
| `limit(n)` | A number | At most that many rows |
| `skip(n)` | A number | Leaves the first rows out |
| `after(cursor)` | The `next` of the page before, or nothing | Answers one page: `{ rows, next }`. `next` is there while more rows follow. It goes with a filter, a sort and `search`, and a screen carries `next` in its address (`topic.screens.lists`) |
| `first()` | | The first row, or nothing |
| `count()` | | How many rows fit |
| `search(words)` | A text | The rows whose search columns hold the words, the best first (`option.table.search`). An empty text finds every row: so one query that takes `words: text({ default: '' })` and hands `input('words')` to `search` lists every row until words are given. `search` takes the words themselves, never `given` |
| `near(column, vector, o)` | A vector column and a vector | The rows nearest by meaning, each with `distance` (`word.vector`). With `search` beside it, one plan answers one list: the rows the words find and the rows nearest by meaning, each search under the same filter and rule, joined by their ranks (reciprocal rank fusion, with no weights to tune). Each row then has `rank`, its place from 1, and `distance` where its meaning was among the nearest. Each search reads four times the `limit` before the two are joined |
| `rank(model, words, { top })` | A model that states the ability `rank`, the words, and how many rows to keep | Has the model score each row by the words, and puts the rows in the order of their scores, the `top` of them where it is stated. The text of a row that is scored is its search columns, or its text columns where it has none. It is a model call, so it is the last member of a plan and stands in an action, a route or a step: in a query or a change it is `code.T0013`. The rule of the table filters the rows first, so it never sees a row the caller may not read. With `first()` and no `limit`, the first ten rows are ranked |

## A filter

A record of columns. A plain value means "equals": `{ status: 'open' }`. Otherwise the value is a record of one check.

| Check | Fits a row whose value |
|---|---|
| `{ above: n }`, `{ atLeast: n }`, `{ below: n }`, `{ atMost: n }` | is more, not less, less, not more |
| `{ before: moment }`, `{ after: moment }` | is earlier, later |
| `{ not: value }` | is another one |
| `{ in: list }` | is one of a list, or of the rows of another plan: `{ team: { in: members.where({ user: caller('id') }).pick(['team']) } }` |
| `{ contains: text }`, `{ startsWith: text }` | holds the text, starts with it |
| `{ empty: true }` | is nothing |

Several columns in one record must all fit. `{ any: [filter, filter] }` fits where one does, `{ all: [...] }` where each does, and `{ not: filter }` where the filter does not. A column of a linked row is named with a point: `{ 'customer.tier': 'gold' }`.

A value that is nothing fits no row. `given` leaves an entry out while its value is nothing, empty text or an empty list: `orders.where({ status: given(input('status')) })` is every order when no status was asked for.

## How a plan is carried out

In a function written in our own words, the plan is the value of `rows`, and the engine carries it out. It is not ended by anything: `input('limit')` stands for a value of the input, and `caller('id')` for the caller.

```ts
export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number({ default: 20, max: 100 }) },
  rows: orders.where({ status: 'open' }).with('customer').newest('placedAt').limit(input('limit')),
})
```

In code, a plan starts at `db` and is ended by the member that carries it out: `.all()` for the rows, `.first()` for one row or nothing, `.count()` for a number. `db.orders.get(id)` needs no end.

```ts
run: ({ input, db }) => db.orders.where({ status: input.status }).with('customer').newest('placedAt').limit(20).all()
```

A plan in code that is not ended is no rows: see `topic.db`.

A screen reads the rows of a query as an entry of its `data`. The view is handed what the plan answers: with `.with('customer')` in the plan, a view reads `o.customer.name`.

## See also

`topic.db`, `word.table`, `word.query`, `option.query.rows`, `option.query.run`, `word.given`
