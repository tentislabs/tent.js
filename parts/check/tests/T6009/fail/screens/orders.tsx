import { component, screen, useField, Form, Link } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

// A field of a component, and one of a plain function, each named by `useField` with no field of the input.
export const NopeField = component('NopeField', {
  view: () => {
    const field = useField('nope')
    return <input {...field.input} />
  },
})

function GoneField() {
  const field = useField('gone')
  return <input {...field.input} />
}

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => (
    <div>
      <Form call={addOrder} with={{ name: 'A shelf' }} values={{ nope: 1 }} reset={['gone']}>
        <input name="name" />
        <input name="totl" />
        <input name="address" />
        <input name="address.street" />
        <input />
        <NopeField />
        <GoneField />
        <button type="submit">Add</button>
      </Form>
      <Link to={orderScreen} with={{ id: 1, nope: 2 }}>
        An order
      </Link>
    </div>
  ),
})

export const orderScreen = screen('orderScreen', {
  path: '/order/:id',
  access: 'signedIn',
  view: ({ params }) => <span>{params.id}</span>,
})
