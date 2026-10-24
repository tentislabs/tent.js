import { boolean, change, emit, event, fail, flow, input, query, text } from 'tentjs'
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

// A trip books a seat, and then a room, which it keeps half booked while it waits. When the trip is stopped, its
// `onStop` takes back what the step at work had done.
export const trip = flow('trip', {
  input: { name: text() },
  key: ({ input }) => input.name,
  stopOn: event('trip.cancelled', { key: ({ data }) => data.name }),
  run: async ({ input, step, db }) => {
    await step('seat', () => addMark({ what: `seat ${input.name}` }))
    await step('room', async (the) => {
      await the.progress({ booked: 'half' })
      return held(db, `room ${input.name}`)
    })
  },
  onStop: async ({ input, stopped, step, db }) => {
    await step('undo', () => addMark({ what: `undo ${input.name} ${stopped.step} ${stopped.progress?.booked}` }))
    if (input.name === 'slow') await step('wait', () => held(db, 'undo slow'))
  },
})

export const cancelTrip = change('cancelTrip', {
  access: 'nobody',
  input: { name: text() },
  run: ({ input }) => {
    emit('trip.cancelled', { name: input.name })
  },
})

// A flow that fails, and one that hears every failure of it, and every stop.

export const billing = flow('billing', {
  input: { fails: boolean() },
  run: async ({ input, step }) => {
    await step('charge', () => {
      if (input.fails) fail('declined', 'The card was declined.')
      return 'charged'
    })
    await step.waitFor('later')
  },
})

export const toldOfBilling = flow('toldOfBilling', {
  on: [event('run.failed', { where: { flow: 'billing' } }), event('run.stopped', { where: { flow: 'billing' } })],
  run: async ({ event, step }) => {
    await step('tell', () => addMark({ what: `told ${event.name} ${event.data.run} ${event.data.failure?.code}` }))
  },
})
