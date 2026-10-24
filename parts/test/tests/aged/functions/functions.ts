import { anyone, change, choice, date, flow, input, text } from 'tentjs'
import { events, gone, lines, notes, pins, teams, visits } from '../tables/tables'

const open = anyone('a test calls it')

export const addEvent = change('addEvent', {
  access: open,
  input: { at: date(), kind: text() },
  set: events.add({ at: input('at'), kind: input('kind') }),
})

export const addLine = change('addLine', {
  access: open,
  input: { at: date(), level: choice(['info', 'error']), words: text() },
  set: lines.add({ at: input('at'), level: input('level'), words: input('words') }),
})

export const pin = change('pin', {
  access: open,
  input: { event: text() },
  set: pins.add({ event: input('event') }),
})

export const note = change('note', {
  access: open,
  input: { event: text(), words: text() },
  set: notes.add({ event: input('event'), words: input('words') }),
})

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addVisit = change('addVisit', {
  access: open,
  input: { team: text(), at: date() },
  set: visits.of(input('team')).add({ at: input('at') }),
})

export const markGone = change('markGone', {
  access: open,
  input: { event: text() },
  set: gone.add({ event: input('event') }),
})

// The trigger of a removal: each event that the upkeep removes is written down.
export const whenGone = flow('whenGone', {
  on: events.removed(),
  run: async ({ event, step }) => {
    await step('mark', () => markGone({ event: event.row.id }))
  },
})
