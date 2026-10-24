import { number, query, table } from 'tentjs'

export const orders = table('orders', { columns: { total: number() }, access: { read: 'signedIn' } })

export function totalOf(rows: { total: number }[]): number {
  return rows.length
}

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.limit(10) })
