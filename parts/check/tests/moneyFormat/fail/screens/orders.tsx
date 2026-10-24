import { screen, read, useField, useTranslations, Form } from 'tentjs/ui'
import { addOrder, openOrders } from '../functions/orders'

/** The total of an order as money, three ways. */
function Totals({ total }: { total: number }) {
  const { format } = useTranslations()
  const t = useTranslations()
  return (
    <p>
      <span>{format(total, 'currency')}</span>
      <span>{t.format(total, { as: 'currency', digits: 0 })}</span>
      <span>{format(total, { as: 'currency', currency: 'EUR' })}</span>
    </p>
  )
}

/** A field of money, handed a format that a field does not take. */
function Total() {
  const f = useField('total', { format: 'currency' })
  return <input {...f.input} />
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
      <Form call={addOrder}>
        <Total />
      </Form>
    </main>
  ),
})
