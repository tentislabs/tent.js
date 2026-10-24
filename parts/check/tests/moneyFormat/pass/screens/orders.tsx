import { screen, read, useTranslations } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

/** The total of an order as money, in the currency of the project. */
function Totals({ total }: { total: number }) {
  const { format } = useTranslations()
  return <span>{format(total, 'currency')}</span>
}

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders }) => (
    <main>
      {orders.map((o) => (
        <Totals key={o.id} total={o.total} />
      ))}
    </main>
  ),
})
