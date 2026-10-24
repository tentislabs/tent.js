import { screen, component, read, boolean, number, text, Form } from 'tentjs/ui'
import { addOrder, allNotes, openOrders } from '../functions/orders'

export const Card = component('Card', {
  view: ({ children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
    </div>
  ),
})

export const Loop = component('Loop', {
  view: () => <Loop />,
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  layout: 'Nowhere',
  loading: 'Nothing',
  view: () => <span>Orders</span>,
})

export const notesScreen = screen('notesScreen', {
  path: '/notes/:name',
  access: 'anyone',
  seo: { addresses: read(openOrders) },
  view: ({ params }) => <span>{params.name}</span>,
})

export const lostScreen = screen('lostScreen', {
  for: 'notFound',
  access: 'signedIn',
  view: () => <span>Nothing is here</span>,
})

export const againLostScreen = screen('againLostScreen', {
  for: 'notFound',
  access: 'anyone',
  view: () => <span>Nothing is here either</span>,
})
