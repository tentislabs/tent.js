import { screen, read } from 'tentjs/ui'
import { Badge } from '@acme/ui'
import { allOrders } from '../functions'
import styles from './orders.module.css'
import './orders.css'

// A view of plain elements, a CSS Module, a style file it imports and a component of a package.
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  title: 'Orders',
  data: { orders: read(allOrders) },
  view: ({ orders }) => (
    <main className={styles.page} id="page">
      <ul>
        {orders.map((o) => (
          <li key={o.id} className="row">
            <Badge>{o.name}</Badge>
          </li>
        ))}
      </ul>
    </main>
  ),
})
