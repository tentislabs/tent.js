import { screen, read, Form } from 'tentjs/ui'
import { addOrder, addSample, openOrders } from './functions'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  title: 'Orders',
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <h1>{orders.length} orders</h1>
      <Form id="add" call={addOrder} aria-label="New order">
        <input name="title" />
        <input name="count" type="number" />
        <input name="urgent" type="checkbox" />
        <button type="submit">Save</button>
      </Form>
      <Form call={addSample}><button type="submit">Add a sample</button></Form>
      {orders.map((order) => <span key={order.id}>{order.title}</span>)}
    </main>
  ),
})
