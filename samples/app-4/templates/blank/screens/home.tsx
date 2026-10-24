import { anyone, screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: 'My app',
  access: anyone('the first screen of a new app shows before it holds anything'),
  view: () => (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, color: '#52525b' }}>
      <h1 style={{ fontSize: 22, color: '#18181b', margin: 0 }}>A new app</h1>
      <p>It is empty for now. Say in the chat what it should be.</p>
    </main>
  ),
})
