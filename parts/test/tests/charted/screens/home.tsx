import { screen } from 'tentjs/ui'
import { BarLine } from 'tiny-bars'

// A screen of a file of its own that draws with a package which imports React, as a library of charts does.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <BarLine label="Bars" value={10} />,
})
