import { screen } from 'tentjs/ui'

// A screen that draws with no package.
export const plainScreen = screen('plainScreen', {
  path: '/plain',
  access: 'anyone',
  view: () => <h1>Plain</h1>,
})
