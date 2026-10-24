import { screen } from 'tentjs/ui'

// A screen that tells who it was drawn for: a key is no caller of it.
export const whoScreen = screen('whoScreen', {
  path: '/who',
  access: 'anyone',
  view: ({ user }) => <h1>{user ? `Drawn for ${user.id}` : 'Drawn for a visitor'}</h1>,
})
