import { screen, Link } from 'tentjs/ui'
import { ordersScreen } from './orders'

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  view: ({ params }) => (
    <main>
      <h1>Order {params.id}</h1>
      <Link to={ordersScreen}>All orders</Link>
    </main>
  ),
})
