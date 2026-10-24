import { screen, read, message } from 'tentjs/ui'
import { allOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  title: message('orders.title'),
  data: { orders: read(allOrders) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{message('orders.title')}</h1>
      {orders.map((o) => <span key={o.id} id="status">{message(['status', o.status])}</span>)}
      <span id="nothing">{message('nothing.here')}</span>
    </main>
  ),
})
