import { project, table, text } from 'tentjs'
import { summarize } from './functions.ts'

export const filling = project('filling', {})

export const orders = table('orders', {
  columns: { title: text(), note: text(), summary: text({ optional: true, by: summarize }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})
