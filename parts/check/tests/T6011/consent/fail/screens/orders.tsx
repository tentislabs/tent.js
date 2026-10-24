import { screen, text } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: { volume: text({ default: 'loud' }) },
  head: [
    { script: { src: 'https://player.example.com/player.js', consent: 'sounding' } },
    { script: { src: 'https://player.example.com/more.js', consent: 'volume' } },
  ],
  view: () => <main>The orders</main>,
})
