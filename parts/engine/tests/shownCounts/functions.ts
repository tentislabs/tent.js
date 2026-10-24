import { action, anyone, change, input, model, query, sum, text } from 'tentjs'
import { usage } from './tables.ts'

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply'], takes: 100000 })

const open = anyone('the tests ask as every kind of caller')

export const ask = action('ask', {
  access: open,
  input: { words: text() },
  output: text(),
  run: async ({ input }) => writer.reply(input.words),
})

export const myUse = query('myUse', {
  access: open,
  input: {},
  rows: usage.where({ name: 'writer' }).group('unit', { amount: sum('amount') }).limit(20),
})

export const myRows = query('myRows', { access: open, input: {}, rows: usage.where({ name: 'writer' }).limit(50) })

export const searched = query('searched', {
  access: open,
  input: {},
  run: ({ db }) => db.usage.search('writer').all(),
})

export const written = change('written', {
  access: open,
  input: { unit: text() },
  set: usage.add({ name: 'writer', unit: input('unit'), amount: 1 }),
})
