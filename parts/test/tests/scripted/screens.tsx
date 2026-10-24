import { asset, screen, Link } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  head: [{ script: { src: asset('shared.js'), load: 'alive' } }],
  view: ({ state }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>Home</h1>
      <Link set={{ agreed: true }}>Agree</Link>
      <span>{state.agreed ? 'Agreed' : 'Not agreed'}</span>
      <Link to="/other">To the other</Link>
    </main>
  ),
})

export const otherScreen = screen('otherScreen', {
  path: '/other',
  access: 'anyone',
  head: [
    { script: { src: asset('shared.js'), load: 'alive' } },
    { script: { src: asset('other.js'), load: 'alive' } },
  ],
  view: () => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>Other</h1>
      <Link to="/">Home again</Link>
    </main>
  ),
})
