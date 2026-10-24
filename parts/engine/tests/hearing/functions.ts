import { change, event, fail, flow, input, query, text } from 'tentjs'
import { marks } from './tables.ts'

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// Holds the work of a step until a mark lets it go, so that its run stays at work.
const held = async (db, name) => {
  while (!(await db.marks.where({ what: `go ${name}` }).first())) await new Promise((done) => setTimeout(done, 5))
  return name
}

// A flow that fails at its first step, with its key.
export const failing = flow('failing', {
  input: { name: text() },
  key: ({ input }) => input.name,
  run: async ({ step }) => {
    await step('charge', () => fail('declined', 'The card was declined.'))
  },
})

// A flow that hears every failure of any run, and fails itself: its own failure starts it no second time.
export const selfish = flow('selfish', {
  on: event('run.failed'),
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `heard ${event.data.flow}` }))
    fail('again', 'It fails as it hears.')
  },
})

// A flow whose onStop holds, so that a test stops it a second time while onStop works.
export const slow = flow('slow', {
  run: async ({ step, db }) => {
    await step('room', async (the) => {
      await the.progress({ booked: 'half' })
      return held(db, 'room')
    })
  },
  onStop: async ({ step, db }) => {
    await step('undo', () => held(db, 'undo'))
  },
})
