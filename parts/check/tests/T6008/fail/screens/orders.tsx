import { screen } from 'tentjs/ui'
import { addOrder, openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => {
    const rows = openOrders({ limit: 10 })
    return (
      <div>
        <span>{String(rows)}</span>
        <button type="button" onClick={() => addOrder({ name: 'A lamp', total: 2 })}>
          Add
        </button>
      </div>
    )
  },
})
