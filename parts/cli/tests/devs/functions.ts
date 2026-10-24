import { anyone, change, input, query, text } from 'tentjs'
import { items } from './tables'

export const allItems = query('allItems', { access: 'anyone', rows: items.oldest('createdAt').limit(100) })

export const addItem = change('addItem', {
  access: anyone('a project of the tests, which nobody else reaches'),
  input: { title: text() },
  set: items.add({ title: input('title') }),
})

// A change that is code: what it writes is worked out by its own lines.
export const stamp = change('stamp', {
  access: anyone('a project of the tests, which nobody else reaches'),
  run: ({ db }) => db.items.add({ title: ['stamped', 'first'].join(' ') }),
})
