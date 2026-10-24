import { screen, read, Form } from 'tentjs/ui'
import { addLater, addOrder, never, openOrders } from './functions'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  title: 'Orders',
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <main id="page" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <h1>{orders.length} orders</h1>
      <Form id="add" call={addOrder} aria-label="New order">
        <label>
          Title <input name="title" />
        </label>
        <button type="submit">Save</button>
      </Form>
      <Form call={addLater} with={{ title: 'Later' }}><button type="submit">
        Add later
      </button></Form>
      <Form call={never}><button type="submit">Never</button></Form>
      <Form call={addOrder} with={{ title: 'Twin' }}><button type="submit">
        Twin
      </button></Form>
      <Form call={addOrder} with={{ title: 'Twin' }}><button type="submit">
        Twin
      </button></Form>
      <div id="orderList" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {orders.map((order) => <span key={order.id} id={`order-${order.id}`}>{order.title}</span>)}
      </div>
    </main>
  ),
})
