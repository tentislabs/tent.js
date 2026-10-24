import { list, project, table, text } from 'tentjs'

export const moreFlows = project('moreFlows', {
  limits: { actionTime: '400 ms', callDepth: 3 },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// An order, whose row starts a flow when it is added or changed.
export const orders = table('orders', {
  columns: { name: text(), status: text() },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
