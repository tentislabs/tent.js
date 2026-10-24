import { table, text } from 'tentjs'

export const plainTable = table('plainTable', {
  columns: { name: text({ max: 40 }) },
  access: { read: 'signedIn' },
})
