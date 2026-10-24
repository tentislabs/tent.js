import { screen } from 'tentjs/ui'
import { Note } from '../components/Note'
import { Shine } from '../components/Shine'
import { Stars } from '../components/Stars'

// A screen that draws the three components.
export const skyScreen = screen('skyScreen', {
  path: '/sky',
  access: 'anyone',
  view: () => (
    <main>
      <Stars count={3} />
      <Note said="Clear" />
      <Shine />
    </main>
  ),
})
