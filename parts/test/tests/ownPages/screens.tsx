import { read, screen } from 'tentjs/ui'
import { stuckDrawer } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <h1>The desk</h1>,
})

// A screen whose view fails as it draws, with words that the error page of production must not show.
export const brokenScreen = screen('brokenScreen', {
  path: '/broken',
  access: 'anyone',
  view: () => {
    throw new Error('the drawer of secrets is stuck')
  },
})

// A screen whose own entry fails, before anything of the page is sent, with the same words.
export const stuckScreen = screen('stuckScreen', {
  path: '/stuck',
  access: 'anyone',
  data: { drawer: read(stuckDrawer) },
  view: () => <h1>Never drawn</h1>,
})

// A screen for signed-in people, in a project that has no screen at its sign-in path.
export const membersScreen = screen('membersScreen', {
  path: '/members',
  access: 'signedIn',
  view: () => <h1>Members</h1>,
})
