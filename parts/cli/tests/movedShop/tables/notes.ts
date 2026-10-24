import { anyone, file, table, text } from 'tentjs'

const open = anyone('the notes are open to anyone')

export const notes = table('notes', {
  columns: { title: text(), secret: text({ sealed: true }), picture: file({ optional: true }) },
  access: { read: open, add: open },
})
