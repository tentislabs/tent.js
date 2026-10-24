import { anyone, table, text } from 'tentjs'

export const items = table('items', {
  columns: { title: text() },
  access: { read: 'anyone', add: anyone('a project of the tests, which nobody else reaches') },
})
