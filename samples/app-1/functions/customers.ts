import { change, choice, input, query, role, text } from 'tentjs'
import { customers } from '../tables/customers'

export const customerList = query('customerList', {
  about: 'Every customer, by name',
  access: role('staff'),
  rows: customers.sort('name').limit(200),
})

export const addCustomer = change('addCustomer', {
  about: 'Adds a customer',
  input: {
    name: text({ min: 1, max: 200 }),
    email: text({ max: 200 }),
    tier: choice(['standard', 'gold'], { default: 'standard' }),
  },
  access: role('staff'),
  set: customers.add({ name: input('name'), email: input('email'), tier: input('tier') }),
})
