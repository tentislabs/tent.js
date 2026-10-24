import { file, link, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A paper is read by its owner alone, and so is the file it holds.
export const papers = table('papers', {
  columns: { owner: link('users', { onRemove: 'remove' }), title: text(), scan: file() },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})
