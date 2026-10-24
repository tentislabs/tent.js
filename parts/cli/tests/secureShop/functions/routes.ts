import { route } from 'tentjs'

// A route on the address of the proof: the engine answers the authority there before the route is asked.
export const challenge = route('challenge', {
  method: 'GET',
  path: '/.well-known/acme-challenge/:token',
  access: 'anyone',
  run: async () => new Response('the route'),
})

export const hello = route('hello', {
  method: 'GET',
  path: '/hello',
  access: 'anyone',
  run: async () => new Response('hello'),
})

// An answer that takes its time, so that requests stand under way at once on one connection.
export const slow = route('slow', {
  method: 'GET',
  path: '/slow',
  access: 'anyone',
  run: async () => {
    await new Promise((done) => setTimeout(done, 1500))
    return new Response('slow')
  },
})
