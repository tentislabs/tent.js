import { screen } from 'tentjs/ui'

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => <span>{params.id}</span>,
})
