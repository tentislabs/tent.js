import { component, screen, read } from 'tentjs/ui'
import { addOrder, openOrders, orders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: {
    rows: read(orders),
    added: read(addOrder, { name: 'A shelf', total: 1 }),
    quick: read(openOrders, { limit: 10 }, { wait: false }),
    again: read(openOrders, { limit: 10 }, { refresh: '1 minute' }),
  },
  view: () => (
    <div>
      <span>Orders</span>
    </div>
  ),
})

export const Count = component('Count', {
  data: { found: read(openOrders, { limit: 10 }, { needed: true }) },
  view: ({ found }) => <span>{found?.length}</span>,
})
