import { screen, component, read, useTranslations, Form } from 'tentjs/ui'
import { markPaid, openOrders } from '../functions/orders'

export const Button = component('Button', {
  view: ({ children }) => (
    <button type="submit" style={{ padding: '8px 16px' }}>
      {children}
    </button>
  ),
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  title: 'Open orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders }) => {
    const { format } = useTranslations()
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
        <h1>Open orders</h1>
        {orders.map((o) => (
          <div key={o.id} style={{ display: 'flex', gap: 12 }}>
            <span>{o.customer.name}</span>
            <span>{format(o.total, 'currency')}</span>
            <Form call={markPaid} with={{ order: o.id }}>
              <Button>Mark paid</Button>
            </Form>
          </div>
        ))}
      </main>
    )
  },
})
