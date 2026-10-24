import { link, list, number, project, table, text } from 'tentjs'

export const flowing = project('flowing', {
  limits: { actionTime: '400 ms', callDepth: 3 },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const customers = table('customers', {
  columns: { name: text(), tier: text() },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: { customer: link('customers'), total: number(), status: text() },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text(), by: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A note that its owner alone reads.
export const notes = table('notes', {
  columns: { title: text(), owner: link('users') },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn' },
})
