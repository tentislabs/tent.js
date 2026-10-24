import { action, anyone, change, flow, input, text } from 'tentjs'
import { vault } from './tables.ts'

const open = anyone('a test calls it')

export const keep = change('keep', {
  access: open,
  input: { title: text(), note: text() },
  set: vault.add({ title: input('title'), note: input('note') }),
})

// An action reads the sealed note of a row.
export const noteOf = action('noteOf', {
  access: open,
  input: { id: text() },
  output: text(),
  run: async ({ input: given, db }) => String((await db.vault.get(given.id))?.note),
})

// A step of a flow reads the same note, and so does the flow between its steps.
export const noteInStep = flow('noteInStep', {
  input: { id: text() },
  run: async ({ input: given, step, db }) => {
    const between = String((await db.vault.get(given.id))?.note)
    const inside = await step('read', async () => String((await db.vault.get(given.id))?.note))
    return `${between} ${inside}`
  },
})
