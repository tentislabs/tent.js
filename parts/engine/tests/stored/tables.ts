import { anyone, file, link, list, project, table, text } from 'tentjs'

// Visitors may hand a file in, and the counts of a minute lie far above what a test asks.
export const stored = project('stored', {
  uploads: anyone('a test uploads as a visitor'),
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, filesPerMinute: 100000, uploadsPerMinute: 1000 },
})

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What a person owns, and what goes with them.
export const papers = table('papers', {
  columns: { title: text(), by: link('users'), paper: file({ optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})

// What nobody owns, and what stays when the person who wrote it is removed.
export const notices = table('notices', {
  columns: { title: text(), picture: file({ optional: true }) },
  access: { read: 'anyone', add: 'signedIn' },
})
