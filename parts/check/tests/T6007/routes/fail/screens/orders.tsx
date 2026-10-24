import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', { path: '/orders', access: 'signedIn', view: () => <span>All</span> })

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => <span>{params.id}</span>,
})
