import { action, change, number, query, text, token } from 'tentjs'

export const oneRead = query('oneRead', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => db.notes.count(),
})

// A query whose thread ends at once, as a thread does that passes its memory.
export const ends = query('ends', {
  access: 'anyone',
  output: number(),
  run: () => {
    process.exit(1)
  },
})

// An action that answers later, and then never lets its thread go.
export const spinsLater = action('spinsLater', {
  access: 'anyone',
  output: number(),
  run: async () => {
    await null
    for (;;) {
      // Never ends, on purpose.
    }
  },
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { what: text() },
  output: text(),
  run: ({ db, input }) => db.notes.add({ what: input.what }).id,
})

// A token of more digits than a value may hold.
export const longToken = action('longToken', {
  access: 'anyone',
  output: number(),
  run: async () => token({ digits: 1_000_001 }).length,
})

export const otherRead = query('otherRead', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => db.notes.count() + 1,
})
