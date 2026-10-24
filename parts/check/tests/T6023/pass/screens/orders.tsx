import { component, screen, read } from 'tentjs/ui'
import { openOrders, paidOrders, rates } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: {
    orders: read(openOrders, { limit: 10 }, { needed: true }),
    paid: read(paidOrders, {}, { wait: false }),
    rates: read(rates, {}, { refresh: '10 minutes' }),
    later: read(rates, {}, { wait: false }),
  },
  view: ({ orders, paid, rates, later }) => (
    <div>
      <span>{orders.length}</span>
      <span>{paid?.length}</span>
      <span>{rates.EUR}</span>
      <span>{later?.EUR}</span>
    </div>
  ),
})

export const Count = component('Count', {
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders }) => <span>{orders?.length}</span>,
})
