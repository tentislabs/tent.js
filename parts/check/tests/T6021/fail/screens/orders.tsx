import { screen, read, useTranslations } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders }) => {
    const { format } = useTranslations()
    return (
      <div>
        <span>{format(orders.length, { as: 'currency', currency: 'EUR' })}</span>
        <span>{format(orders.length, { as: 'currency', digits: 0 })}</span>
        {orders.map((o) => (
          <span key={o.id}>{format(o.total, 'currency')}</span>
        ))}
      </div>
    )
  },
})
