import { action, change, flow, input, list, number, text } from 'tentjs'
import { marks, notes, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const removeMark = change('removeMark', {
  access: 'signedIn',
  input: { id: text() },
  set: marks.remove(input('id')),
})

// How often each piece of work was carried out: a remembered answer is not carried out again.
let made = 0

export const counted = action('counted', {
  access: 'signedIn',
  remember: true,
  input: { n: number() },
  output: number(),
  run: async () => {
    made += 1
    return made
  },
})

// An answer that rests on the marks alone, which every caller reads alike.
export const markCount = action('markCount', {
  access: 'signedIn',
  remember: { shared: 'the marks are the same for everyone who is signed in' },
  input: { n: number() },
  output: number(),
  run: async ({ db }) => {
    made += 1
    return (await db.marks.count()) * 1000 + made
  },
})

// An answer that rests on the notes of its caller, which a second caller reads otherwise.
export const noteCount = action('noteCount', {
  access: 'signedIn',
  remember: { shared: 'the builder says so, and is wrong: the notes are each owner own' },
  input: { n: number() },
  output: number(),
  run: async ({ db }) => {
    made += 1
    return (await db.notes.count()) * 1000 + made
  },
})

// A step that remembers its answer by the values it rests on.
export const keyed = flow('keyed', {
  input: { n: number() },
  run: async ({ input: given, step }) =>
    step(
      'count',
      () => {
        made += 1
        return made
      },
      { remember: { key: [given.n] } },
    ),
})

// A shared answer that rests on one note, named by its id: a caller who may not read that note reads it otherwise.
export const noteTitle = action('noteTitle', {
  access: 'signedIn',
  remember: { shared: 'the title of a note is the same for everyone who may read it' },
  input: { id: text() },
  output: text(),
  run: async ({ input: given, db }) => {
    made += 1
    const note = await db.notes.get(given.id)
    return note ? `${note.title} ${made}` : `none ${made}`
  },
})

// An answer that rests on its caller, and is remembered for that caller alone.
export const nameOf = action('nameOf', {
  access: 'signedIn',
  remember: true,
  input: { n: number() },
  output: text(),
  run: async ({ user }) => {
    made += 1
    return `${String(user?.id)} ${made}`
  },
})
