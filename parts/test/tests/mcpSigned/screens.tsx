import { screen } from 'tentjs/ui'

// The screen at `signInPath`, which a person who is sent there sees.
export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  access: 'anyone',
  view: () => <h1>Sign in</h1>,
})
