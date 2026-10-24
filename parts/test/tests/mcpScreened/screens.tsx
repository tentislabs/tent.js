import { screen, read, Form, Image, Link } from 'tentjs/ui'
import { addOrder, openOrders } from './functions'

// A screen that is offered to MCP: the orders of the person, with their pictures, and a form that adds one.
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  about: 'The orders of the person, with a form that adds one',
  offer: ['mcp'],
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      <h1>{orders.length} orders</h1>
      {orders.map((one, place) => (
          <div key={place} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span id="title">{one.title}</span>
            <Image className="photo" src={one.photo} alt={one.title} width={40} height={40} priority />
          </div>
        ))}
      <Form id="add" call={addOrder}>
        <input name="title" id="newTitle" />
        <button type="submit" id="send">Add the order</button>
      </Form>
      <Link to="/about" id="more">About the shop</Link>
    </div>
  ),
})
