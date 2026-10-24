import { change, input, number, query, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { title: text(), rank: number() },
  access: { read: 'anyone', add: 'anyone' },
})

export const presses = table('presses', {
  columns: { word: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.sort('rank') })

export const pressCount = query('pressCount', { access: 'anyone', rows: presses.count() })

// What a press calls: a press while the tool picks must call it never.
export const press = change('press', { access: 'anyone', set: presses.add({ word: 'pressed' }) })

export const addNote = change('addNote', {
  access: 'anyone',
  input: { title: text() },
  set: notes.add({ title: input('title'), rank: 99 }),
})
