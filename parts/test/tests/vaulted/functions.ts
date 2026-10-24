import { action, anyone, change, input, list, object, query, secrets, table, text } from 'tentjs'

const open = anyone('a test reads what only a machine with the key opens')

// What is stored encrypted, each value by itself, under the key of the secrets.
export const vault = table('vault', {
  columns: { title: text(), note: text({ sealed: true }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const keep = change('keep', {
  access: open,
  input: { title: text(), note: text() },
  set: vault.add({ title: input('title'), note: input('note') }),
})

export const kept = query('kept', {
  access: open,
  output: list(object({ title: text(), note: text() })),
  rows: vault.oldest('title'),
})

export const valueOf = action('valueOf', {
  access: open,
  input: { name: text() },
  output: text(),
  run: async ({ input: given }) => secrets[given.name].reveal(),
})
