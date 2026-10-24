import { screen } from 'tentjs/ui'
import { greeting } from './words'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: ({ settings }) => (
    <main>
      <h1>{String(settings.shopName)}</h1>
      <span>{greeting}</span>
    </main>
  ),
})
