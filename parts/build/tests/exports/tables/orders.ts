import { number, table, text, where } from 'tentjs'

export const orders = table('orders', {
  columns: { placedBy: text(), total: number() },
  access: {
    read: where((user) => {
      let placedBy = user?.id
      return { placedBy }
    }),
    add: where((user) => {
      let placedBy = user?.id
      return { placedBy, total: 1 }
    }),
    remove: where((user) => {
      let placedBy = user?.id
      return { placedBy, total: 0 }
    }),
    change: where((user) => {
      let placedBy = user?.id
      return { placedBy, total: { below: 100 } }
    }),
  },
})

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })
