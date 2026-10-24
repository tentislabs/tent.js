import { read, screen } from 'tentjs/ui'
import { findThing } from './functions'

// A screen whose entry is needed: where its query says the thing is not found, the screen is not found.
export const thingScreen = screen('thingScreen', {
  path: '/things/:id',
  access: 'anyone',
  title: 'Thing',
  data: ({ params }) => ({ thing: read(findThing, { id: params.id }, { needed: true }) }),
  view: ({ thing }) => <span id="name">{thing.name}</span>,
})
