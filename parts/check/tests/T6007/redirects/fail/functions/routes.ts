import { route } from 'tentjs'

export const readFeed = route('readFeed', {
  method: 'GET',
  path: '/feed',
  access: 'signedIn',
  run: async () => new Response('<rss/>'),
})
