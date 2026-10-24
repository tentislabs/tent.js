import { anyone, route } from 'tentjs'

const open = anyone('a feed is open to every reader')

// A route that states no `GET` may share the address of a screen.
export const addOrder = route('addOrder', {
  method: 'POST',
  path: '/orders',
  access: 'signedIn',
  run: async () => new Response('added'),
})

// Two routes of one address, each with a method of its own.
export const readFeed = route('readFeed', {
  method: 'GET',
  path: '/feed.xml',
  access: 'anyone',
  run: async () => new Response('<rss/>'),
})

export const writeFeed = route('writeFeed', {
  method: ['PUT', 'DELETE'],
  path: '/feed.xml',
  access: open,
  run: async () => new Response('written'),
})

// An address that is more exact than that of a screen is another address.
export const newOrder = route('newOrder', {
  method: 'GET',
  path: '/orders/new',
  access: 'anyone',
  run: async () => new Response('new'),
})
