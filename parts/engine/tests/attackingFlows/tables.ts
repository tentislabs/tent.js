import { list, project, table, text } from 'tentjs'

// A caller who is nobody may make five calls a minute from one address, so that a flood is held by the door.
export const attackingFlows = project('attackingFlows', {
  limits: { actionTime: '400 ms', anyonePerMinute: 5, callerPerMinute: 100000 },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
