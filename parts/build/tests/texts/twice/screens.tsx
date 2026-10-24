import { screen, message } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  title: message('orders.title'),
  view: () => <h1>{message('orders.title')}</h1>,
})
