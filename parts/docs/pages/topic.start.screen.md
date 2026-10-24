# A screen with its data, and a link

A screen names its address, who may see it, and its `data`: each entry is asked as the caller and handed to the view. The view is React: elements of HTML, and the tags of `tentjs/ui`. A `Link` is a link to another screen, and `with` gives the values of its address. The look is the project's CSS (`topic.look`).

```tsx
// screens/orders.tsx
import { read, role, screen, Link } from 'tentjs/ui'
import { openOrders } from '../functions/orders'
import { orderScreen } from './order'

export const ordersScreen = screen('ordersScreen', {
  path: '/',
  title: 'Open orders',
  access: role('staff'),
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <main>
      <h1>Open orders</h1>
      {orders.length === 0 && <p>Nothing is open</p>}
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={orderScreen} with={{ id: order.id }}>
              {order.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  ),
})
```

A value of the address is read from `params`. `needed: true` makes a row that is not there the screen that is not found, with 404. A `Form` calls a change: here with no field the person types, and `with` gives the order. `format` of `useTranslations` writes a number in the language of the page.

```tsx
// screens/order.tsx
import { read, role, screen, useTranslations, Form } from 'tentjs/ui'
import { getOrder, markDone } from '../functions/orders'

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  title: 'An order',
  access: role('staff'),
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
  view: ({ order }) => {
    const { format } = useTranslations()
    return (
      <main>
        <h1>{order.title}</h1>
        <p>{format(order.total, 'number')}</p>
        <Form call={markDone} with={{ order: order.id }}>
          <button type="submit">Mark done</button>
        </Form>
      </main>
    )
  },
})
```
