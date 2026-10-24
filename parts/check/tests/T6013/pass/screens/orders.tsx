import { screen, useGoTo, Form, Link } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => {
    const go = useGoTo()
    return (
      <div>
        <Link to="/orders?page=2">Page two</Link>
        <Link to="#top">Up</Link>
        <Form call={addOrder} then={{ href: 'https://example.com/thanks' }}>
          <button type="submit">Add</button>
        </Form>
        <Form call={addOrder} then={{ goTo: '/orders' }}>
          <button type="submit">Add again</button>
        </Form>
        <a href="https://example.com/help">Help</a>
        <a href="mailto:help@example.com">Write to us</a>
        <button type="button" onClick={() => go('/orders')}>
          Go
        </button>
      </div>
    )
  },
})
