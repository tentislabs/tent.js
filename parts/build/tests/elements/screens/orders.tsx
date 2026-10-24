import { screen, read, useTranslations, Link, Form } from 'tentjs/ui'
import { Card } from '../components/Card'
import { addOrder, openOrders } from '../functions/orders'

// Screens of plain elements with the tags, `format`, a component, a list, and a value that a row may not hold.
const LABELS = { open: 'Open', paid: 'Paid' }

export const layoutScreen = screen('layoutScreen', {
  path: '/layout',
  access: 'anyone',
  title: 'Layouts',
  data: { orders: read(openOrders, { limit: 2 }) },
  view: ({ orders }) => (
    <main style={{ display: 'flex', flexDirection: 'row', background: '#f5f6f8' }}>
      <div style={{ width: '100%', height: 120 }} />
      <Link to={listScreen} style={{ display: 'grid', gap: 4 }}>
        <div />
        <Form call={addOrder} with={{ name: 'New', total: 1, rush: false }}><button type="submit" hidden={orders.length === 0}></button></Form>
      </Link>
    </main>
  ),
})

export const wordsScreen = screen('wordsScreen', {
  path: '/words',
  access: 'anyone',
  title: ({ orders }) => `${orders.length} orders`,
  data: { orders: read(openOrders, { limit: 2 }) },
  view: ({ orders, user, params }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ color: '#2f5bea' }}>
        Orders &amp; more: {orders.length}
      </h1>
      <p>
        The first is <span style={{ fontWeight: 600 }}>{orders[0]?.name ?? 'none'}</span>, {LABELS[orders[0].status]}.
      </p>
      <span>{useTranslations().format(orders[0].total, 'currency')}</span>
      <span>{useTranslations().format(orders[0].total / 3, { as: 'number', digits: 1 })}</span>
      <span>{useTranslations().format(orders.length / 4, 'percent')}</span>
      <Link to="/list">{`To ${orders.length > 1 ? 'all' : 'the one'}`}</Link>
      <Form call={addOrder} with={{ name: orders[0].name, total: orders[0].total + 1, rush: !orders[0].rush }} id="again"><button type="submit">
        Order again
      </button></Form>
      {user ? <span>Signed in as {user.id}</span> : <span style={{ color: '#5f6672' }}>A visitor of {params.rest ?? 'this page'}</span>}
    </div>
  ),
})

export const listScreen = screen('listScreen', {
  path: '/list',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 2 }) },
  view: ({ orders }) => (
    <ul>
      {orders.length ? orders.map((o, i) => (
          <Link key={o.id} to={wordsScreen} style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
            <span>
              {i + 1}. {o.name}
            </span>
            {o.rush && <span style={{ color: '#cf222e' }}>Rush</span>}
            <Card title={o.customer?.name} padding="loose">
              <span>{o.note ?? 'No note'}</span>
            </Card>
          </Link>
        )) : <span>Nothing yet</span>}
      {[].length ? [].map((o, place) => <span key={place}>{o}</span>) : <span>None of these</span>}
    </ul>
  ),
})

export const missingScreen = screen('missingScreen', {
  path: '/missing',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 2 }) },
  view: ({ orders }) => <span>{orders[5].customer.name}</span>,
})

export const guardedScreen = screen('guardedScreen', {
  path: '/guarded',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 2 }) },
  view: ({ orders }) => <span>{orders[5]?.customer.name ?? 'Nobody'}</span>,
})
