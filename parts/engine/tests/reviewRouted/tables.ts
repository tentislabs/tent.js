import { anyone, project, table, text } from 'tentjs'

export const routed = project('routed', {})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: anyone('the notes are shown to every visitor') },
})
