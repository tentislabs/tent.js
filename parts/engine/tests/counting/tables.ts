import { anyone, file, list, project, table, text } from 'tentjs'

// Many calls of the tests come from one address: the counts of a minute are set far above them.
export const shop = project('shop', {
  privateHosts: ['http://127.0.0.1'],
  uploads: anyone('the tests upload files as a visitor'),
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000 },
})

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { title: text(), paper: file({ optional: true }) },
  access: { read: 'anyone', add: 'anyone' },
})
