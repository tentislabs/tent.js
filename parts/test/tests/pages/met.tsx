import { useState } from 'react'
import { screen, read, useGoTo, Form, Link } from 'tentjs/ui'
import { addOrder, openOrders, ordersOnce, rates, rushOrder } from './functions'

// Moves that are disabled.
export const givenScreen = screen('givenScreen', {
  path: '/given',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{orders.length} orders</h1>
      <Link to="/forms" disabled>
        Closed way
      </Link>
      <Link to="/forms">Open way</Link>
      <Link to="/forms" disabled>
        <span>A closed box</span>
      </Link>
    </main>
  ),
})

// A screen that shows a query and an action, with a press that calls: a plain one.
export const bothScreen = screen('bothScreen', {
  path: '/both',
  access: 'anyone',
  data: {
    orders: read(openOrders, { limit: 50 }),
    once: read(ordersOnce),
    rates: read(rates, { base: 'USD' }),
  },
  view: ({ orders, once, rates }) => (
    <main>
      <h1>{orders.length} orders</h1>
      <span>{once.length} read once</span>
      <span>EUR {rates.EUR}</span>
      <Form call={addOrder} with={{ name: 'Both', total: 1 }}><button type="submit">
        Add one
      </button></Form>
    </main>
  ),
})

// The same with a view that is code, whose `data` is written as an arrow.
export const bothCodeScreen = screen('bothCodeScreen', {
  path: '/both/code',
  access: 'anyone',
  data: () => ({
    orders: read(openOrders, { limit: 50 }),
    once: read(ordersOnce),
    rates: read(rates, { base: 'USD' }),
  }),
  view: ({ orders, once, rates }) => {
    const [pressed] = useState(0)
    return (
      <main>
        <h1>{orders.length} orders</h1>
        <span>{once.length} read once</span>
        <span>
          EUR {rates.EUR} {pressed}
        </span>
        <Form call={addOrder} with={{ name: 'Both', total: 1 }}><button type="submit">
          Add one
        </button></Form>
      </main>
    )
  },
})

// A view that is drawn on the server, and fails where a browser draws it.
export const breaksScreen = screen('breaksScreen', {
  path: '/breaks',
  access: 'anyone',
  view: () => {
    if (typeof document !== 'undefined') throw new Error('the view broke in the browser')
    return <span>Drawn on the server</span>
  },
})

// A view whose draw takes long on the server.
export const slowScreen = screen('slowScreen', {
  path: '/slow',
  access: 'anyone',
  view: () => {
    const until = Date.now() + (typeof document === 'undefined' ? 80 : 0)
    while (Date.now() < until) {
      // Time passes.
    }
    return <span>Drawn slowly</span>
  },
})

export const movesScreen = screen('movesScreen', {
  path: '/moves',
  access: 'anyone',
  view: () => {
    const goTo = useGoTo()
    return (
      <main>
        <button type="button" onClick={() => goTo('/orders/new', undefined, { replace: true })}>
          In its place
        </button>
        <button type="button" onClick={() => goTo('/orders/new')}>
          After it
        </button>
      </main>
    )
  },
})
