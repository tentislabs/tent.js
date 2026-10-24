import { screen } from 'tentjs/ui'

export const signIn = screen('signIn', { path: '/sign-in', access: 'anyone', view: () => <span>Sign in</span> })

// Offered to MCP with no `about`, which its tool is described by.
export const shopScreen = screen('shopScreen', {
  path: '/shop',
  access: 'signedIn',
  offer: ['mcp'],
  view: () => <span>The shop</span>,
})
