import { screen, read, text, Form } from 'tentjs/ui'
import { addOrder, openOrders } from '../functions/shop'

export const signIn = screen('signIn', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in</span> })

// A screen in a chat that reads and calls only what is offered to MCP, and keeps its state in the page.
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  about: 'The orders of the person',
  offer: ['mcp'],
  state: { filter: text({ default: '' }) },
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orders.map((one, place) => <span key={place}>{one.title}</span>)}
      <Form call={addOrder} with={{ title: 'A shelf' }}><button type="submit">
        Add a shelf
      </button></Form>
    </div>
  ),
})
