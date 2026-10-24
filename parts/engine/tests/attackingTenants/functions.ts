import { anyone, change, emit, event, flow, input, text } from 'tentjs'
import { orders, teams } from './tables.ts'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { team: text(), title: text() },
  set: orders.of(input('team')).add({ title: input('title') }),
})

// A drip of mails for each order of a team, in the file of that team, which a cancel of the order stops.
export const drip = flow('drip', {
  on: orders.added({ where: { title: 'order' } }),
  stopOn: event('order.cancelled', { key: ({ data }) => data.order }),
  run: async ({ step }) => {
    await step.wait('1 day')
  },
})

// A cancel that writes a note into the file of a team, and then emits, so that its event is of that file.
export const cancelIn = change('cancelIn', {
  access: open,
  input: { team: text(), order: text() },
  run: ({ input, db }) => {
    db.orders.of(input.team).add({ title: 'a note of a cancel' })
    emit('order.cancelled', { order: input.order })
  },
})

// A cancel that writes nothing of a team, so that its event is of the shared file.
export const cancelShared = change('cancelShared', {
  access: open,
  input: { order: text() },
  run: ({ input }) => {
    emit('order.cancelled', { order: input.order })
  },
})
