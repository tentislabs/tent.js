import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => (
    <main style={{ padding: 16 }}>
      <h1>Hello</h1>
    </main>
  ),
})
