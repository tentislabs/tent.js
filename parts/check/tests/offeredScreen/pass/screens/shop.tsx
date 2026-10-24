import { screen } from 'tentjs/ui'

export const signIn = screen('signIn', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in</span> })

export const shopScreen = screen('shopScreen', {
  path: '/shop',
  access: 'signedIn',
  about: 'What the shop holds',
  offer: ['mcp'],
  view: () => <span>The shop</span>,
})
