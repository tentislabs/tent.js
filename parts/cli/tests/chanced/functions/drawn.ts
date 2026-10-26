import { action, change, flow, json, list, number, random, table, text, token } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A change that adds a row, whose id the app makes.
export const addNote = change('addNote', {
  access: 'signedIn',
  input: {},
  set: notes.add({ words: 'drawn' }),
})

// A flow whose one step draws a number.
export const stepped = flow('stepped', {
  as: 'starter',
  input: {},
  output: number(),
  run: async ({ step }) => step.random(),
})

// Everything the app's own code draws: the words of the framework, a row id, and the runtime's own.
export const drawn = action('drawn', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: async () => {
    const row: unknown = await addNote({})
    return {
      random: random(),
      token: token(),
      id: Reflect.get(Object(row), 'id'),
      math: Math.random(),
      step: await stepped({}),
    }
  },
})

// The time as the app's own code reads it.
export const stamp = action('stamp', {
  access: 'signedIn',
  input: {},
  output: number(),
  run: async () => Date.now(),
})

// A number the app draws, which a test holds to a value it never has.
export const pick = action('pick', {
  access: 'signedIn',
  input: {},
  output: number(),
  run: async () => random(),
})
