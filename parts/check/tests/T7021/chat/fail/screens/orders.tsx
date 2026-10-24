import { screen, read, text, Form } from 'tentjs/ui'
import { addOrder, openOrders } from '../functions/shop'

export const signIn = screen('signIn', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in</span> })

// A screen in a chat that calls a function which is not offered to MCP and keeps a state in the device, in a
// project whose `unlock` lists a script.
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  about: 'The orders of the person',
  offer: ['mcp'],
  state: { filter: { type: text({ default: '', max: 50 }), in: 'device' } },
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
