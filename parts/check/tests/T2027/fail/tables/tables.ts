import { link, table, text } from 'tentjs'

export const presence = table('presence', {
  kept: 'memory',
  lasts: '30 seconds',
  columns: { doc: text() },
  access: { read: 'signedIn' },
})

// A row of memory goes by itself: a link to it would point at nothing.
export const notes = table('notes', {
  columns: { words: text(), seenBy: link('presence', { onRemove: 'clear', optional: true }) },
  access: { read: 'signedIn' },
})
