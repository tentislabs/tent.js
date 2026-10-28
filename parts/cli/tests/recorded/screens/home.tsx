import { screen } from 'tentjs/ui'

export const home = screen('home', {
  path: '/',
  access: 'signedIn',
  view: () => <h1>Recorded</h1>,
})
