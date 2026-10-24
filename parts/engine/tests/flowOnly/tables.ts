import { list, project, table, text } from 'tentjs'

export const flowOnly = project('flowOnly', { limits: { anyonePerMinute: 100000, callerPerMinute: 100000 } })

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const notes = table('notes', { columns: { words: text() }, access: { read: 'anyone' } })
