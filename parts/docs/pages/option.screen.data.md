# `data` of `screen`

What the screen reads before it is drawn.

## Value

A record of entries, each a `read(query or action, input, options)`. The view is handed the answer of each entry under its name. Where an input needs a value of the address or of the state, `data` is written as an arrow over `{ params, state, user, settings }` that returns the record.

An entry is asked when every value its input needs is there, and asked again when one of them changes. A name of `data` may not be one of the names every view is handed, as `state` or `user`.

## Example

```tsx
import { screen, read } from 'tentjs/ui'
import { ordersByStatus } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders/:status',
  access: 'signedIn',
  data: ({ params }) => ({ orders: read(ordersByStatus, { status: params.status }) }),
  view: ({ orders }) => (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>{o.customer}</li>
      ))}
    </ul>
  ),
})
```

## Errors

`code.T1009`: a name of `data` is one of the names every view is handed.

`code.T1014`: an entry that is no `read(...)`.

`code.T6023`: an entry that reads what is neither a query nor an action.

## See also

`word.screen`, `word.read`
