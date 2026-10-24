import { screen, read, Form } from 'tentjs/ui'
import { countOrders, placeOrder } from './functions'

// A press that places an order: the call, its writes and the work it starts are one trace.
export const orderScreen = screen('orderScreen', {
  path: '/order',
  access: 'anyone',
  data: { count: read(countOrders) },
  view: ({ count }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{count} orders</h1>
      <Form call={placeOrder} with={{ title: 'A press', note: 'the word of the press' }}><button type="submit">
        Place one
      </button></Form>
    </main>
  ),
})
