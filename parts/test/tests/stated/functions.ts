import { choice, input, number, query, table, text } from 'tentjs'

export const items = table('items', {
  columns: { name: text(), kind: choice(['tool', 'toy']), place: number() },
  access: { read: 'anyone' },
})

export const itemsOf = query('itemsOf', {
  access: 'anyone',
  input: { kind: choice(['tool', 'toy']) },
  rows: items.where({ kind: input('kind') }).oldest('place'),
})

export const itemNamed = query('itemNamed', {
  access: 'anyone',
  input: { name: text() },
  rows: items.where({ name: input('name') }).first(),
})
