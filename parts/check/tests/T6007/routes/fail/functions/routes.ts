import { anyone, route } from 'tentjs'

const open = anyone('a feed is open to every reader')

// A route that states `GET` at the address of a screen: one of the two could never be reached.
export const listOrders = route('listOrders', {
  method: ['GET', 'POST'],
  path: '/orders',
  access: 'signedIn',
  run: async () => new Response('all'),
})

// The name of a value of the address does not tell two paths apart.
export const oneOrder = route('oneOrder', {
  method: 'GET',
  path: '/orders/:order',
  access: 'signedIn',
  run: async () => new Response('one'),
})

export const readFeed = route('readFeed', {
  method: ['GET', 'PUT'],
  path: '/feed.xml',
  access: open,
  run: async () => new Response('<rss/>'),
})

// Two routes of one address that both state `PUT`.
export const writeFeed = route('writeFeed', {
  method: ['PUT', 'DELETE'],
  path: '/feed.xml',
  access: open,
  run: async () => new Response('written'),
})
