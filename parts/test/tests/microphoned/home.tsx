import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => <h1>Home</h1>,
})
