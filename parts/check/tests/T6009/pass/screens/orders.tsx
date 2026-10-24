import { component, screen, useField, Form } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

// A field of a component, and one of a plain function, each named by `useField` with a field of the input.
export const NoteField = component('NoteField', {
  view: () => {
    const field = useField('note')
    return <input {...field.input} />
  },
})

function StatusField() {
  const field = useField('status')
  return <select {...field.input} />
}

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => (
    <div>
      <Form call={addOrder} with={{ status: 'open' }} values={{ note: 'By hand' }} reset={['name']}>
        <input name="name" />
        <input name="total" type="number" />
        <textarea name="note" />
        <input name="address.city" />
        <button type="submit">Add</button>
      </Form>
      <Form call={addOrder}>
        <input name="name" />
        <input name="total" />
        <NoteField />
        <StatusField />
      </Form>
      <Form call={addOrder}>
        <input name="name" type="email" />
        <input name="note" type="search" />
        <select name="status" />
        <input name="rush" type="checkbox" />
      </Form>
    </div>
  ),
})
