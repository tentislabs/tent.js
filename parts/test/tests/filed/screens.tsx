import { screen } from 'tentjs/ui'

// The one screen of the app: a browser of a test asks for it again after a sign-in, as a page does.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: ({ user }) => <h1>{user ? `Signed in as ${user.id}` : 'A visitor'}</h1>,
})
