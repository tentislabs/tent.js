# `read`

Names a query or an action that a screen reads, with its input. It stands as an entry of `data`, and the view is handed the answer under the name of the entry.

## Example

```tsx
import { screen, read, useTranslations } from 'tentjs/ui'
import { getOrder, currencyRates } from '../functions/orders'

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  data: ({ params }) => ({
    order: read(getOrder, { id: params.id }, { needed: true }),
    rates: read(currencyRates, { base: 'USD' }, { wait: false, refresh: '10 minutes' }),
  }),
  view: ({ order, rates }) => {
    const { format } = useTranslations()
    return (
      <p>
        {order.customer}: {format(order.total, 'currency')}, {rates?.EUR}
      </p>
    )
  },
})
```

`read(what, input, options)` takes a query or an action as the screen file imported it, its input, and how it is asked. The input is typed by the function's own input, and the answer by its own answer.

A query is asked while the page is drawn, so the first HTML already holds its rows. An action is called read-only: it may read, and whatever would write or send is refused.

## Options

| Option | Means |
|---|---|
| `option.read.needed` | `needed: true`: the screen is not found, with status 404, when the entry answers nothing, and when its query fails as not found: `code.T0001`, `code.T2103`, or a `fail('not-found', ...)` of its own. So the entry is never nothing in its view: a query that may answer no row is read with no check for it, as `order.customer` in the example, and the type checker holds the view to that. Without `needed`, the view is handed what the query may answer, nothing among it, and must look before it reads. |
| `option.read.wait` | `wait: false`: the page is sent without waiting for the entry. Its name is nothing at first, and `calls.<name>.busy` is true until the answer arrives. It stands on an action and on a query that states `heavy`. |
| `option.read.refresh` | `refresh: '10 minutes'`: an action is asked again on that timer while the screen is shown. A query states its own. |

## Returns

A record that names what is read: `{ read: 'getOrder', input: { id: '42' }, needed: true }`. Nothing is asked when `read` is called: the page asks through the door.

## Errors

`code.T1011`: `refresh` is no length of time.

`code.T1014`: an entry of `data` that is no `read(...)`.

## See also

`word.screen`, `word.component`, `option.screen.data`
