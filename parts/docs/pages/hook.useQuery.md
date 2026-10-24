# `useQuery`

Asks a query or an action from the middle of the code of a view. `data` is the declared way: `useQuery` is for code that needs data where no entry of `data` fits.

## Example

```tsx
import { screen, useQuery } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => {
    const orders = useQuery(openOrders, { limit: 20 })
    if (orders.error) return <p role="alert">{orders.error.message}</p>
    return (
      <ul aria-busy={orders.busy}>
        {(orders.value ?? []).map((o) => (
          <li key={o.id}>{o.customer.name}</li>
        ))}
      </ul>
    )
  },
})
```

## Takes

`useQuery(query, input, options)`: a query or an action as the screen file imported it, its input, and `{ hold: true }`, which holds the asking back until it is false.

## Returns

`{ value, busy, error, again }`. `value` is the answer, typed by the function's own answer, or nothing while it is asked. `busy` is true while an answer is on its way. `error` is what a caller sees of a failure: `{ code, name, message, fields, ref }`. `again()` asks once more, and `value` keeps the old answer until the new one arrives.

On the server it is answered at once, so the first HTML holds its rows. In the browser it first takes the answer the page came with, and asks only for what the page does not hold.

A query is live unless it states `live: false`: the page then watches it for as long as the view shows it, and `value` changes when a row that it read is written, by this page or by anyone else (`topic.live`). `again()` is for a query that is not live, and for an action. Where the caller loses the right to the query while the view shows it, `error` holds what the engine said, and the watch is over until `again()` is called.

## See also

`hook.useCall`, `word.read`, `topic.plans`, `topic.screens`, `topic.live`
