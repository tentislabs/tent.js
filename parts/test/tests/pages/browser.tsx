import { screen, read, text, Link, Form } from 'tentjs/ui'
import { addOrder, failing, openOrders } from './functions'

// What a press does: a call with its busy state, what follows it, a failure, and a box that is pressed.
export const pressScreen = screen('pressScreen', {
  path: '/press',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders, calls }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{orders.length} orders</h1>
      <Link to={formsScreen}>To the forms</Link>
      {orders.map((o, place) => <Link key={place} to={rowScreen} with={{ name: o.name, tab: 'open' }}>{o.name}</Link>)}
      <Form call={addOrder} with={{ name: 'Pressed', total: 1 }} id="slow"><button type="submit">
        {calls.slow.busy ? 'Adding' : 'Add one'}
      </button></Form>
      <Form call={addOrder} with={{ name: 'Keyed', total: 2 }}><button type="submit">
        Add by key
      </button></Form>
      <Form call={failing} id="fails"><button type="submit">
        {calls.fails.error ? calls.fails.error.code : 'Fail'}
      </button></Form>
      <Form call={addOrder} with={{ name: 'Boxed', total: 3 }}><button type="submit">
        <span>A box that is pressed</span>
      </button></Form>
      <Form call={addOrder} with={{ name: 'Gone', total: 4 }} then={{ goTo: '/orders/new' }}><button type="submit">
        Add and go
      </button></Form>
    </main>
  ),
})

// A screen that the first screen of the file goes to, and that goes back to it.
export const formsScreen = screen('formsScreen', {
  path: '/forms',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{orders.length} orders</h1>
      <Link to={pressScreen}>To the presses</Link>
    </main>
  ),
})

// A screen with a value of its address and a state it keeps there, which the first screen of the file goes to.
export const rowScreen = screen('rowScreen', {
  path: '/rows/:name',
  access: 'anyone',
  state: { tab: { type: text({ default: 'all' }), in: 'address' } },
  view: ({ params, state }) => (
    <span>
      {params.name} {state.tab}
    </span>
  ),
})
