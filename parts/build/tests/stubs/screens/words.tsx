import { screen } from 'tentjs/ui'

export const wordsScreen = screen('wordsScreen', {
  path: '/words',
  access: 'anyone',
  view: () => (
    <main>
      <p>Plain words</p>
    </main>
  ),
})
