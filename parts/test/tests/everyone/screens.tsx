import { screen, read, Form } from 'tentjs/ui'
import { chatMessages, helper, openOrders } from './functions'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  title: 'Orders',
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <h1>{orders.length} orders</h1>
      {orders.map((order) => (
        <span key={order.id} id={`order-${order.id}`}>
          {order.title}
        </span>
      ))}
    </main>
  ),
})

// The chat screen of the agent: the conversation, what it writes while it works, and the field to ask in.
export const chatScreen = screen('chatScreen', {
  path: '/chats/:id',
  title: 'Ask',
  access: 'signedIn',
  data: ({ params }) => ({
    messages: read(chatMessages, { chat: params.id }),
    working: read(helper.working, { thread: params.id }),
  }),
  view: ({ messages, working, params }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      {messages.map((m, place) => <span key={place}>{m.text}</span>)}
      {working.length > 0 ? <>
        <span>{working[0].text ?? 'Working...'}</span>
      </> : null}
      <Form call={helper} with={{ thread: params.id }}>
        <label>Your question <input name="message" /></label>
      </Form>
    </div>
  ),
})
