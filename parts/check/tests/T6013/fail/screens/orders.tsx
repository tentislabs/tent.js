import { screen, useGoTo, Form, Link } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => {
    const go = useGoTo()
    return (
      <div>
        <Link to="//evil.example/">Away</Link>
        <Link to="/%2F%2Fevil.example">Away too</Link>
        <Link to="/orders\\evil">Back away</Link>
        <Form call={addOrder} then={{ href: 'javascript:alert(1)' }}>
          <button type="submit">Run</button>
        </Form>
        <Form call={addOrder} then={{ href: 'ftp://example.com/file' }}>
          <button type="submit">Fetch</button>
        </Form>
        <button type="button" onClick={() => go('/a//evil.example')}>
          Go
        </button>
      </div>
    )
  },
})
