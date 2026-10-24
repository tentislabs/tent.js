import { link, table, text } from 'tentjs'
import { cases, summarize, whoOf } from './functions.ts'

export const customers = table('customers', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})

// A summary that work makes from the title and the note, a value made from that summary, the name of the
// customer read through the link, and two columns that one call of one work fills.
export const orders = table('orders', {
  columns: {
    title: text(),
    note: text(),
    tag: text({ optional: true }),
    customer: link('customers', { optional: true }),
    summary: text({ optional: true, by: summarize }),
    loud: text({ optional: true, by: { work: cases, input: { text: 'summary' }, take: 'upper' } }),
    quiet: text({ optional: true, by: { work: cases, input: { text: 'summary' }, take: 'lower' } }),
    who: text({ optional: true, by: { work: whoOf, input: { name: 'customer.name' } } }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})
