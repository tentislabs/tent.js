import { screen } from 'tentjs/ui'

// A screen that is not offered to MCP, in a file of its own: no file of a screen in a chat holds it.
export const aboutScreen = screen('aboutScreen', {
  path: '/about',
  access: 'anyone',
  view: () => <h1>About the shop</h1>,
})
