import { screen, component, read, boolean, number, text, Form } from 'tentjs/ui'
import { addOrder, allNotes, openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  cache: 60_000,
  view: () => <span>Orders</span>,
})

export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'anyone',
  cache: 60_000,
  data: { orders: read(openOrders) },
  view: ({ orders }) => <span>{orders.length}</span>,
})
