import { screen, component, read, boolean, number, text, Form, Link } from 'tentjs/ui'
import { addOrder, allNotes, openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: {
    open: boolean(),
    page: { type: number({ default: 1, min: 1, whole: true }), in: 'address', reset: ['gone'] },
    mode: text({ default: '' }),
  },
  view: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link set={{ nope: true }}>Nope</Link>
      <Link set={{ page: 'two' }}>Two</Link>
      <Form call={addOrder} then={{ set: { missing: true } }}>
        <button type="submit">Add</button>
      </Form>
      <Toggle />
    </div>
  ),
})

// A component with a state of its own.
export const Toggle = component('Toggle', {
  state: { on: boolean() },
  view: ({ state }) => <Link set={{ on: !state.on }}>{state.on ? 'On' : 'Off'}</Link>,
})
