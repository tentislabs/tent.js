import { screen } from 'tentjs/ui'

// A view that fails on the server: what it reads is not there.
function Fails(): never {
  throw new Error('the view broke')
}

export const breaksScreen = screen('breaksScreen', {
  path: '/breaks',
  access: 'anyone',
  title: 'Breaks',
  view: () => (
    <span>
      <Fails />
    </span>
  ),
})
