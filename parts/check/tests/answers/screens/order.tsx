import { screen, read } from 'tentjs/ui'
import { getOrder } from '../functions/orders'

// An entry that is needed is never nothing in its view: where it answers nothing, the screen is not found.
export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
  title: ({ order }) => order.name,
  view: ({ order }) => <span>{order.name}</span>,
})

// An entry that is not needed may be nothing, and the type checker asks for it.
export const maybeScreen = screen('maybeScreen', {
  path: '/maybe/:id',
  access: 'signedIn',
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }) }),
  title: ({ order }) => order.name, // refused
  view: ({ order }) => <span>{order?.name}</span>,
})
