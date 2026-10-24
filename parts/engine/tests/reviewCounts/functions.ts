import { action, anyone, change, flow, input, model, query, sum, text } from 'tentjs'
import { notes, usage } from './tables.ts'

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply'], takes: 100000 })

const open = anyone('the tests ask as every kind of caller')

export const ask = action('ask', {
  access: open,
  input: { words: text() },
  output: text(),
  run: async ({ input }) => writer.reply(input.words),
})

// The rows of the use of a user that the caller names, through a filter.
export const usageOf = query('usageOf', {
  access: open,
  input: { user: text() },
  rows: usage.where({ user: input('user') }).limit(50),
})

export const usageGrouped = query('usageGrouped', {
  access: open,
  input: {},
  rows: usage.where({}).group('user', { amount: sum('amount') }).limit(50),
})

export const usageWith = query('usageWith', {
  access: open,
  input: {},
  rows: usage.where({}).with('user').limit(50),
})

export const written = change('written', {
  access: open,
  input: { unit: text() },
  set: usage.add({ name: 'writer', unit: input('unit'), amount: 1 }),
})

// Raw SQL that writes the counts, under the name of the table and under the engine's own name.
export const rawUsage = change('rawUsage', {
  access: 'nobody',
  system: 'it shows a raw write of the counts',
  input: {},
  run: ({ db }) => {
    db.sql('UPDATE "usage" SET "amount" = 0')
  },
})

export const rawCounts = change('rawCounts', {
  access: 'nobody',
  system: 'it shows a raw write of the counts',
  input: {},
  run: ({ db }) => {
    db.sql('UPDATE "_t_counts" SET "amount" = 0')
  },
})

export const addNote = change('addNote', {
  access: open,
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

// A flow that a write sets off, and that calls the model in a step.
export const onNote = flow('onNote', {
  on: notes.added(),
  run: async ({ step }) => {
    await step('think', () => writer.reply('A note was added.'))
  },
})

// A flow that runs as the system, which a caller calls through the door.
export const systemWork = flow('systemWork', {
  access: open,
  input: {},
  output: text(),
  run: async ({ step }) => {
    await step('think', () => writer.reply('Work.'))
    return 'worked'
  },
})
