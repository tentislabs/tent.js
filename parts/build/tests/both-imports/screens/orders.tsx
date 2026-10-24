import { query } from 'tentjs'
import { screen } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/',
  access: 'signedIn',
  view: () => <span>{String(query)}</span>,
})
