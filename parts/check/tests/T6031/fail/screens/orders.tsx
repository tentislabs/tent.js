import { screen, boolean } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: { videos: { type: boolean(), in: 'address' } },
  head: [{ script: { src: 'https://player.example.com/player.js', consent: 'videos' } }],
  view: () => <main>The orders</main>,
})
