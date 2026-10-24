import './screens.css'
import { screen, read, role, text, useQuery, useTranslations, Form } from 'tentjs/ui'
import { addOrder, failing, openOrders, orderNamed, rates, sneaky, staffOrders, staffRates } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: ({ orders }) => `${orders.length} orders`,
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders, user }) => {
    const { format } = useTranslations()
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1>Orders</h1>
        {orders.length ? (
          orders.map((o) => (
            <div key={o.id} style={{ display: 'flex', gap: 8 }}>
              <span>{o.name}</span>
              <span>{format(o.total, 'currency')}</span>
              <span>{format(o.placedAt, 'date')}</span>
            </div>
          ))
        ) : (
          <span>Nothing yet</span>
        )}
        <span>{user ? user.id : 'A visitor'}</span>
      </main>
    )
  },
})

export const accountScreen = screen('accountScreen', {
  path: '/account',
  access: 'signedIn',
  view: ({ user }) => <span>Account of {user.id}</span>,
})

export const staffScreen = screen('staffScreen', {
  path: '/staff',
  access: role('staff'),
  data: { orders: read(staffOrders) },
  view: ({ orders }) => <span>{orders.length} for the staff</span>,
})

// Open to every signed-in caller, with an entry that only the staff may read.
export const mixedScreen = screen('mixedScreen', {
  path: '/mixed',
  access: 'anyone',
  data: { orders: read(staffOrders) },
  view: ({ orders }) => <span>{orders.length} mixed</span>,
})

export const orderScreen = screen('orderScreen', {
  path: '/orders/:name',
  access: 'anyone',
  state: { tab: { type: text({ default: 'all' }), in: 'address' } },
  data: ({ params }) => ({ order: read(orderNamed, { name: params.name }, { needed: true }) }),
  title: ({ order }) => order.name,
  view: ({ order, state, params }) => (
    <div>
      <h1>{order.name}</h1>
      <span>{typeof order.placedAt}</span>
      <span>
        {state.tab} of {params.name}
      </span>
    </div>
  ),
})

export const restScreen = screen('restScreen', {
  path: '/docs/*',
  access: 'anyone',
  framedBy: ['https://studio.example.com'],
  view: ({ params }) => <span>Docs: {params.rest}</span>,
})

export const exactScreen = screen('exactScreen', {
  path: '/orders/new',
  access: 'anyone',
  view: () => <span>A new order</span>,
})

const fails = (): never => {
  throw new Error('the view broke')
}

export const brokenScreen = screen('brokenScreen', {
  path: '/broken',
  access: 'anyone',
  view: () => <span>{fails()}</span>,
})

export const lateScreen = screen('lateScreen', {
  path: '/late',
  access: 'anyone',
  server: false,
  data: { orders: read(openOrders, { limit: 1 }) },
  view: ({ orders }) => <span>{orders.length} drawn in the browser</span>,
})

export const ratesScreen = screen('ratesScreen', {
  path: '/rates',
  access: 'anyone',
  data: {
    rates: read(rates, { base: 'USD' }, { refresh: '10 minutes' }),
    later: read(rates, { base: 'EUR' }, { wait: false }),
  },
  view: ({ rates, later, calls }) => (
    <div>
      <span>EUR {rates.EUR}</span>
      <span>{calls.later.busy ? 'Asking' : `Later ${later?.EUR}`}</span>
    </div>
  ),
})

export const staffRatesScreen = screen('staffRatesScreen', {
  path: '/rates/staff',
  access: 'anyone',
  data: { rates: read(staffRates) },
  view: ({ rates }) => <span>EUR {rates.EUR}</span>,
})

export const failingScreen = screen('failingScreen', {
  path: '/failing',
  access: 'anyone',
  data: { answer: read(failing) },
  view: () => <span>Never drawn</span>,
})

export const sneakyScreen = screen('sneakyScreen', {
  path: '/sneaky',
  access: 'anyone',
  data: { answer: read(sneaky) },
  view: () => <span>Never drawn</span>,
})

export const queryScreen = screen('queryScreen', {
  path: '/query',
  access: 'anyone',
  view: () => {
    const found = useQuery(openOrders, { limit: 3 })
    return <span>{found.value?.length ?? 'none'} by a hook</span>
  },
})

