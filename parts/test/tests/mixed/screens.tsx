import { screen } from 'tentjs/ui'
import { Hidden, Shown } from './mixed'

// A screen that draws both parts of one file.
export const mixedScreen = screen('mixedScreen', {
  path: '/mixed',
  access: 'anyone',
  view: () => (
    <div>
      <Shown label="pressed" />
      <Hidden said="hello" />
    </div>
  ),
})
