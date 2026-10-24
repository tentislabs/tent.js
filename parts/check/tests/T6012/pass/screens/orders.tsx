import { screen, component, read, boolean, number, text, Form } from 'tentjs/ui'
import { addOrder, allNotes, openOrders } from '../functions/orders'

export const Card = component('Card', {
  view: ({ children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
    </div>
  ),
})

export const Spinner = component('Spinner', {
  view: () => <span>Loading</span>,
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  layout: Card,
  loading: Spinner,
  view: () => <span>Orders</span>,
})

export const notesScreen = screen('notesScreen', {
  path: '/notes/:title',
  access: 'anyone',
  seo: { addresses: read(allNotes) },
  view: ({ params }) => <span>{params.title}</span>,
})

export const lostScreen = screen('lostScreen', {
  for: 'notFound',
  access: 'anyone',
  view: () => <span>Nothing is here</span>,
})
