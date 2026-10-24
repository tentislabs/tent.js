import { change, choice, input, query, text } from 'tentjs'
import { notes, orders } from '../tables/orders'

export const ordersByStatus = query('ordersByStatus', {
  access: 'signedIn',
  input: { status: choice(['open', 'paid'], { default: 'open' }) },
  rows: orders.where({ status: input('status') }).with('customer').limit(50),
})

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { note: text(), source: text() },
  set: notes.add({ note: input('note'), source: input('source') }),
})
