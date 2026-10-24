# This project is built with Tent.js

Read this file first. Run `tent check` after every change: it reports every mistake at once, each with its fix.

## The three file rules

1. A file imports from one of `tentjs` (a backend file), `tentjs/ui` (a screen file) and `tentjs/cli` (a command file), never two of them.
2. A backend file exports only definitions.
3. A helper that both sides use lives in a file of its own, which imports neither.

A definition is a top-level `export const name = <word>('name', { ... })`. The exported name and the stated name are the same. A definition that is renamed states its old name with `was`.

## The ten words, each by one example

```ts
export const shop = project('shop', { title: 'Shop', languages: ['en'] })
```

```ts
export const orders = table('orders', {
  columns: { customer: link('customers'), total: number({ min: 0 }), status: choice(['open', 'paid'], { default: 'open' }) },
  access: { read: 'signedIn', add: 'signedIn', change: role('staff') },
})
```

```ts
export const openOrders = query('openOrders', {
  input: { limit: number({ default: 50, max: 200 }) },
  access: 'signedIn',
  rows: orders.where({ status: 'open' }).newest('createdAt').limit(input('limit')),
})
```

```ts
export const markPaid = change('markPaid', {
  input: { order: link('orders') },
  access: 'signedIn',
  set: orders.change(input('order'), { status: 'paid' }),
})
```

```ts
export const refund = action('refund', {
  input: { order: link('orders') },
  access: role('staff'),
  run: async ({ input, db }) => {
    const order = await db.orders.get(input.order)
    if (!order) fail('not-found', 'That order is not there.')
    await stripe.createRefund({ charge: order.chargeId })
  },
})
```

```ts
export const bigOrder = flow('bigOrder', {
  on: orders.added({ where: { total: { above: 1000 } } }),
  run: async ({ event, step }) => {
    await step('tell sales', () => mail.send({ to: 'sales@example.com', subject: 'Big order', text: event.row.id }))
    await step.wait('3 days')
  },
})
```

```tsx
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>
          <Link to={orderScreen} with={{ id: o.id }}>{o.customer}</Link>
          <Form call={addNote} with={{ order: o.id }}>
            <input name="note" />
            <button type="submit">Add</button>
          </Form>
        </li>
      ))}
    </ul>
  ),
})
```

```tsx
export const PriceTag = component('PriceTag', {
  props: { amount: number() },
  view: ({ amount }) => {
    const { format } = useTranslations()
    return <span className="price">{format(amount, 'currency')}</span>
  },
})
```

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
  calls: { createRefund: post('/v1/refunds', { input: { charge: text() } }) },
})
```

```ts
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })
```

## What to know before writing

- The types are `text`, `number`, `boolean`, `date`, `day`, `choice`, `link`, `file`, `list`, `object`, `json` and `vector`. A value is required unless it states `optional: true`.
- Every table has `id`, `createdAt` and `updatedAt` by itself. A rule that is left out means `'nobody'`.
- A rule is `'nobody'`, `'signedIn'`, `'owner'`, `role('staff')`, `anyone('why')`, `where(filter)` or `allow((user, input, db) => ...)`. `access` is required on every function.
- Data is written by a `change` and by nothing else. A query reads through `db` only: no clock but `now`, no random value, no network.
- A `run` that holds only our words is read and stored, and its definition is plain. Anything else makes it code, and `tent check` says what made it so.
- Work a value out with the value words: `calc`, `round`, `later`, `between`, `each`, `sum`, `concat` and the others. Compare two moments with `between(a, b, 'ms')`, never with `==`.
- A secret is written `secret('NAME')`, never as its value.
- A view is React: elements of HTML, components of any package, and the tags `Link`, `Form` and `Image` of `tentjs/ui`. Its look is the project's CSS and any library: `tent docs topic.look`.

## The commands

| Command | Does |
|---|---|
| `tent check` | Builds the description, carries out every rule and the type checker, and prints every finding at once |
| `tent build` | Writes a bundle into `.tent/build/`, or into `--out <folder>` |
| `tent map` | Prints the whole app as a short outline |
| `tent docs` | With no name, opens on the first page, which walks one app from nothing, and lists the topics |
| `tent docs <name or code>` | Prints a page of the docs: `tent docs T1003`, `tent docs query`, `tent docs topic.words`. For rows: `topic.plans` and `topic.db`. For users: `topic.users`. For a sign-in: `topic.signIn` |
| `tent new <name>` | Makes a bare project: one screen and the query it reads |
| `tent add <package>` | Installs an npm package into the project, with its install scripts switched off |

Every command takes `--json`, and then prints `{ "ok", "value", "findings" }`.

A finding names its code, its file and line, its definition, what is wrong, and the fix. `tent docs <code>` explains the code.

Every page is listed by `tent docs`, and each word, option, tag, hook, command and code that this does not show stands in the reference: `tent docs --reference`, or the file `reference.txt` of the installed package.
