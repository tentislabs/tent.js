import { route } from 'tentjs'

// A route that states no `GET` may share the address of a redirect.
export const addToFeed = route('addToFeed', {
  method: 'POST',
  path: '/feed',
  access: 'signedIn',
  run: async () => new Response('added'),
})
