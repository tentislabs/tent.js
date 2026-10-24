import 'tiny-font'
import './app.css'
import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <h1>Home</h1>,
})
