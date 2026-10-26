import { route } from 'tentjs'

// A route that a signed-in caller reads.
export const feed = route('feed', {
  method: 'GET',
  path: '/feed',
  access: 'signedIn',
  run: () => new Response('the feed of the shop'),
})
