import { date, table, text } from 'tentjs'

export const signInCodes = table('signInCodes', {
  columns: { email: text({ personal: true }), code: text({ sealed: true, private: true }), until: date() },
  access: { read: 'nobody', add: 'nobody', change: 'nobody', remove: 'nobody' },
})
