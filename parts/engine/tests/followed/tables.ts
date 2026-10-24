import { list, project, table, text } from 'tentjs'

export const followed = project('followed', { limits: { anyonePerMinute: 100000, callerPerMinute: 100000 } })

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})
