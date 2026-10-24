import { screen, read, useCall, useQuery, Form } from 'tentjs/ui'
import { addOrder, openOrders } from '../functions/orders'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders }) => {
    const more = useQuery(openOrders, { limit: 50 })
    const add = useCall(addOrder)
    return (
      <div>
        <span>{orders.length}</span>
        <span>{more.value?.length}</span>
        <Form call={addOrder} with={{ name: 'A shelf', total: 1 }}><button type="submit">
          Add one
        </button></Form>
        <button type="button" onClick={() => add.call({ name: 'A lamp', total: 2 })}>
          Add another
        </button>
      </div>
    )
  },
})
