import { anyone, number, query, table, text } from 'tentjs'

const open = anyone('the screens of the libraries show the sales to every visitor')

export const sales = table('sales', {
  columns: { month: text(), amount: number() },
  access: { read: open },
})

export const allSales = query('allSales', { access: open, rows: sales.oldest('createdAt').limit(12) })
