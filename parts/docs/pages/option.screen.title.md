# `title` of `screen`

The title of the page.

## Value

Text, or an arrow over what the view is handed that gives text: `({ order }) => order.customer`.

An arrow over the answers of `data` is written after `data` in the record: the type checker reads the record from its top, so an arrow written above `data` is handed none of its names (`TS2339`, "Property 'order' does not exist"), and neither is the view after it.

```tsx
export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
  title: ({ order }) => order.customer,
  view: ({ order }) => <h1>{order.customer}</h1>,
})
```

## Example

```tsx
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  title: 'Open orders',
  access: 'signedIn',
  view: () => <h1>Open orders</h1>,
})
```

## See also

`word.screen`
