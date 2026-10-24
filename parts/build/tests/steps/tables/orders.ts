import { table, text } from 'tentjs'

export const orders = table('orders', { columns: { status: text() }, access: { read: 'signedIn' } })
