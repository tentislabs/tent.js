import { action, query, runs, table, text } from 'tentjs'
import { noted } from './helpers/seen.ts'
import { customers } from './tables.ts'

export const customerCount = query('customerCount', { access: 'signedIn', rows: customers.count() })

// Work that reads the store, in each way that a fill may not, and work that always fails.
export const probing = action('probing', {
  access: 'nobody',
  system: 'fills the result of a probe',
  input: { what: text() },
  output: text(),
  run: async ({ input, db }) => {
    await noted('probing', input)
    if (input.what === 'db') await db.customers.count()
    if (input.what === 'query') await customerCount()
    if (input.what === 'runs') await runs.find({})
    if (input.what === 'fail') throw new Error('this work always fails')
    return `probed ${input.what}`
  },
})

export const probes = table('probes', {
  columns: { what: text(), result: text({ optional: true, by: probing }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})
