import { file, link, list, project, table, text } from 'tentjs'

export const teamPapers = project('teamPapers', {
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, filesAtOnce: 2 },
  backups: { every: false },
})

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'anyone', add: 'anyone', remove: 'anyone' },
})

// The papers of each team stand in a data file of that team, and each goes with the person who wrote it.
export const papers = table('papers', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    by: link('users', { onRemove: 'remove' }),
    title: text(),
    paper: file({ optional: true }),
  },
  tenant: 'team',
  owner: 'by',
  keepHistory: true,
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})
