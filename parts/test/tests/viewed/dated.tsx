import { day, screen } from 'tentjs/ui'

// A state kept in the address whose default is today: the address need not name a day for the screen to draw.
export const datedScreen = screen('datedScreen', {
  path: '/dated',
  access: 'anyone',
  title: 'Dated',
  state: { day: { type: day({ default: 'today' }), in: 'address' } },
  view: ({ state }) => <span id="day">{state.day}</span>,
})
