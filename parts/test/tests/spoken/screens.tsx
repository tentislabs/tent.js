import { boolean, screen, read, useField, useTranslations, message, Form, Link } from 'tentjs/ui'
import { addOrder, allOrders } from './functions'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  title: message('orders.title'),
  data: { orders: read(allOrders) },
  view: ({ orders }) => {
    const { t, format } = useTranslations()
    return (
      <main>
        <h1>{t('orders.title')}</h1>
        <p id="count">{t('orders.count', { count: orders.length })}</p>
        <p id="none">{t('orders.count', { count: 0 })}</p>
        <p id="one">{t('orders.count', { count: 1 })}</p>
        <p id="only">{t('only.english')}</p>
        <ul>
          {orders.map((o) => (
            <li key={o.id} className="order">
              <span className="name">{o.name}</span> <span className="status">{t(`status.${o.status}`)}</span>{' '}
              <span className="money">{format(o.total, 'currency')}</span>{' '}
              <span className="share">{format(0.25, 'percent')}</span>
            </li>
          ))}
        </ul>
        <select id="picked" name="picked">
          <option value="open">{t('status.open')}</option>
        </select>
        <Link id="home" to="/">Home</Link>
        <Link id="toTurkish" language="tr">{t('language.turkish')}</Link>
        <Link id="toEnglish" language="en">{t('language.english')}</Link>
        <Link id="ordersInTurkish" to="/orders" language="tr">Siparişler</Link>
      </main>
    )
  },
})

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => {
    const { t, language, languages } = useTranslations()
    return (
      <main>
        <h1>{t('greeting', { name: 'Ada' })}</h1>
        <p id="language">{language + ' of ' + languages.join(' ')}</p>
        <Link id="orders" to="/orders">Orders</Link>
      </main>
    )
  },
})

export const addScreen = screen('addScreen', {
  path: '/add',
  access: 'anyone',
  title: 'Add',
  view: () => (
    <main>
      <Form id="add" call={addOrder}>
        <NameField />
        <select name="status">
          <option value="open">Open</option>
          <option value="paid">Paid</option>
        </select>
        <input id="total" name="total" type="number" />
        <button type="submit" id="send">Add</button>
      </Form>
    </main>
  ),
})

/** The name of an order, a field that `useField` drives, which shows the words of its failed check under it. */
function NameField() {
  const f = useField('name')
  return (
    <label id="name">
      {f.label} <input {...f.input} />
      {f.error && <span id={f.errorId}>{f.error}</span>}
    </label>
  )
}

export const sidesScreen = screen('sidesScreen', {
  path: '/sides',
  access: 'anyone',
  title: 'Sides',
  view: () => (
    <main style={{ padding: 0, width: 400 }}>
      <div id="row" style={{ display: 'flex', flexDirection: 'row', gap: 0, width: 400 }}>
        <div id="first" style={{ width: 50, height: 20, background: '#ff0000' }} />
        <div id="second" style={{ width: 50, height: 20, background: '#0000ff' }} />
      </div>
      <div id="free" style={{ display: 'flex', flexDirection: 'column', width: 400, height: 40 }}>
        <div id="placed" style={{ width: 20, height: 20, background: '#00ff00' }} />
      </div>
    </main>
  ),
})

export const timesScreen = screen('timesScreen', {
  path: '/times',
  access: 'anyone',
  title: 'Times',
  view: () => {
    const { format } = useTranslations()
    return (
      <main>
        <p id="at">{format('2026-01-15T22:30:00.000Z', 'dateTime')}</p>
        <p id="ago">{format('2026-01-15T10:00:00.000Z', 'relative')}</p>
      </main>
    )
  },
})

// Two forms that a visitor with no script sends: one sets a state of the address, one moves to another screen.
export const contactScreen = screen('contactScreen', {
  path: '/contact',
  access: 'anyone',
  title: 'Contact',
  state: { sent: { type: boolean(), in: 'address' } },
  view: ({ state }) => (
    <main>
      <p id="sent">{state.sent ? 'sent' : 'not sent'}</p>
      <Form id="set" call={addOrder} with={{ status: 'open', total: 1 }} then={{ set: { sent: true } }}>
        <input name="name" />
        <button type="submit">Set</button>
      </Form>
      <Form id="moved" call={addOrder} with={{ status: 'open', total: 1 }} then={{ goTo: ordersScreen }}>
        <input name="name" />
        <button type="submit">Move</button>
      </Form>
    </main>
  ),
})

// Messages written among the children of elements: alone, in a list, and inside a tag of the page code.
export const writtenScreen = screen('writtenScreen', {
  path: '/written',
  access: 'anyone',
  title: 'Written',
  view: () => (
    <main>
      <h1 id="said">{message('greeting', { name: 'Ada' })}</h1>
      <p id="listed">{[message('status.open'), ' / ', message('status.paid')]}</p>
      <Link id="linked" to="/orders">
        {message('orders.title')}
      </Link>
    </main>
  ),
})
