import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', { path: '/orders', access: 'signedIn', view: () => <span>All</span> })

export const againScreen = screen('againScreen', { path: '/orders', access: 'signedIn', view: () => <span>Again</span> })

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => <span>{params.id}</span>,
})

export const namedScreen = screen('namedScreen', {
  path: '/orders/:name',
  access: 'signedIn',
  view: ({ params }) => <span>{params.name}</span>,
})
