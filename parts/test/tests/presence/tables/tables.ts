import { anyone, boolean, link, list, table, text, where } from 'tentjs'

const open = anyone('a test reads and writes it')

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: open, add: open },
})

// Who is at which document now: rows of the writer's memory alone, gone thirty seconds after their last write.
// A row that is not shown is read by no caller but the system.
export const presence = table('presence', {
  kept: 'memory',
  lasts: '30 seconds',
  columns: {
    user: link('users', { onRemove: 'remove' }),
    doc: text(),
    typing: boolean({ default: false }),
    shown: boolean({ default: true }),
  },
  owner: 'user',
  access: { read: where({ shown: true }), add: open, change: open },
})
