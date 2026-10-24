import { number, read, screen } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

const titles = { open: 'Open orders' }

export const readScreen = screen('readScreen', {
  path: '/read',
  access: 'signedIn',
  state: { limit: { type: number({ default: 10 }), in: 'address' } },
  data: ({ state }) => ({ orders: read(openOrders, { limit: state.limit }) }),
  title: ({ orders }) => `${titles.open}: ${orders.length}`,
  view: ({ orders }) => (
    <ul>
      {orders.map((o) => (
        <li key={o.id}>{o.name}</li>
      ))}
    </ul>
  ),
})

export const callScreen = screen('callScreen', {
  path: '/call',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 10 }) },
  title: ({ orders }) => String(orders.length),
  view: ({ orders }) => <p>{orders.length}</p>,
})
