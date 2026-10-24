import { action, change, file, files, input, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const papers = table('papers', {
  columns: { title: text(), paper: file() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const addPaper = change('addPaper', {
  access: 'signedIn',
  input: { title: text(), paper: file() },
  set: papers.add({ title: input('title'), paper: input('paper') }),
})

// What the test reads back of a file that a row holds: its name and its words.
export const paperOf = action('paperOf', {
  access: 'signedIn',
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) =>
    `${(await files.info(given.id))?.name ?? ''}: ${Buffer.from(await files.get(given.id)).toString('utf8')}`,
})
