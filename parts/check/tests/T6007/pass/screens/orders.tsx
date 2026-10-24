import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', { path: '/orders', access: 'signedIn', view: () => <span>All</span> })

export const newScreen = screen('newScreen', { path: '/orders/new', access: 'signedIn', view: () => <span>New</span> })

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => <span>{params.id}</span>,
})

export const restScreen = screen('restScreen', {
  path: '/orders/*',
  access: 'signedIn',
  view: ({ params }) => <span>{params.rest}</span>,
})
