// The list of the open orders.
// Two comments stand before the screen, and one after it.
import { screen, read, Form } from 'tentjs/ui'
import { openOrders, markPaid } from '../functions/orders'

/* a block comment before the definition */
export const commentsScreen = screen('commentsScreen', {
  path: '/comments', // the address is stated
  title: 'Open orders',

  access: 'signedIn',
  // the data is read once
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      {/* a comment inside the view */}
      <span>Open orders</span>

      {orders.map((o, place) => (
        <div key={place} style={{ display: 'flex', flexDirection: 'row', gap: 12, background: '#ffffff' }}>
          <span>{o.customer.name}</span>
          {/* the total, in the currency of the project */}
          <span>{String(o.total)}</span>
          <Form call={markPaid} with={{ order: o.id }}><button type="submit">Mark paid</button></Form>
        </div>
      ))}
    </div>
  ),
})
// a comment after the definition

/* and a block comment at the end of the file */
