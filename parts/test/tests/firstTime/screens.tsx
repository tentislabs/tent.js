import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: ({ user }) => <h1>{user ? `Signed in as ${user.id}` : 'A visitor'}</h1>,
})
