import { action, change, table, text } from 'tentjs'
import { noted } from './helpers/seen.ts'

// Work that fills a column on a thread: each value is a run of its own, found again by the pass that starts again.
export const briefOf = action('briefOf', {
  access: 'nobody',
  system: 'fills the brief of a letter',
  background: true,
  sends: false,
  input: { title: text() },
  output: text(),
  run: async ({ input: given }) => {
    await noted('briefOf', given)
    return `brief ${given.title}`
  },
})

export const letters = table('letters', {
  columns: { title: text(), brief: text({ optional: true, by: briefOf }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

// An order written in raw SQL, which sets no mark: `tent filled --look` finds it.
export const rawOrder = change('rawOrder', {
  access: 'nobody',
  system: 'writes an order in raw SQL',
  touches: ['orders'],
  input: { id: text(), title: text(), note: text() },
  run: ({ db, input: given, now }) => {
    db.sql('INSERT INTO "orders" ("id", "createdAt", "updatedAt", "title", "note") VALUES (?, ?, ?, ?, ?)', [
      given.id,
      now.getTime(),
      now.getTime(),
      given.title,
      given.note,
    ])
    return given.id
  },
})
