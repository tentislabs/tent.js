import { action, files, list, table, text } from 'tentjs'
import { painter, writer } from './models'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// A plain action that asks a model.
export const hello = action('hello', {
  access: 'signedIn',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => writer.reply(`Say hello to ${input.name}`),
})

// Keeps a photo of the caller's own, and answers its id.
export const keepPhoto = action('keepPhoto', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => files.put(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]), { name: 'mine.png' }),
})

// The kind of a file that the caller may download.
export const fileKind = action('fileKind', {
  access: 'signedIn',
  input: { id: text() },
  output: text(),
  run: async ({ input }) => (await files.info(input.id))?.kind ?? 'none',
})

// Calls the model that is a function, as code calls one.
export const paint = action('paint', {
  access: 'signedIn',
  input: { prompt: text(), photo: text({ optional: true }) },
  output: text(),
  run: async ({ input }) => {
    const made = await painter({ prompt: input.prompt, photo: input.photo })
    return `${made.said} ${made.picture}`
  },
})
