import { choice, query, table, text, message } from 'tentjs'

export const orders = table('orders', {
  columns: {
    name: text({ label: message('field.title') }),
    status: choice(['open', 'paid', 'void'], { messages: 'status' }),
  },
  access: { read: 'anyone' },
})

export const allOrders = query('allOrders', { access: 'anyone', rows: orders.oldest('name').limit(50) })
