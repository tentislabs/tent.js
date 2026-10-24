import { screen, component, read, choice, number, text, Link, Form, Image, useTranslations } from 'tentjs/ui'
import { ordersByStatus, addNote } from '../functions/orders'      // backend definitions arrive as stubs
import { orderScreen } from './order'
import styles from './orders.module.css'
import { Badge } from '@acme/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',                         // stated, never taken from the file name
  title: 'Open orders',
  access: 'signedIn',
  state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address', back: true } },
  data: ({ state }) => ({ orders: read(ordersByStatus, { status: state.tab }) }),     // read(query, input) - 31-screen-to-page.md, section 3
  view: ({ orders, state }) => {
    const { format } = useTranslations()
    return (
      <main className={styles.page}>
        <nav>
          <Link to={ordersScreen} with={{ tab: 'open' }}>Open</Link>
          <Link to={ordersScreen} with={{ tab: 'paid' }}>Paid</Link>
        </nav>
        <ul>
          {orders.map((o) => (
            <li key={o.id} className="flex gap-3">
              <Image src={o.photo} alt="" width={48} height={48} />
              <Link to={orderScreen} with={{ id: o.id }}>{o.customer.name}</Link>
              <span>{format(o.total, 'currency')}</span>
              {state.tab === 'open' && <Badge>open</Badge>}
            </li>
          ))}
        </ul>
        <Form call={addNote} with={{ source: 'web' }} reset={['note']}>
          <input name="note" />
          <button type="submit">Add</button>
        </Form>
      </main>
    )
  },
})

export const PriceTag = component('PriceTag', {
  props: { amount: number(), currency: text({ default: 'USD' }) },
  view: ({ amount, currency }) => {
    const { format } = useTranslations()
    return <span>{format(amount, { currency })}</span>
  },
})
