import { number, project, query, table, text } from 'tentjs'

export const shop = project('shop', { title: 'A plain shop' })

export const orders = table('orders', { columns: { name: text(), total: number() }, access: { read: 'anyone' } })

export const openOrders = query('openOrders', { access: 'anyone', rows: orders.oldest('name') })
