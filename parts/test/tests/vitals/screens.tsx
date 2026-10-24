import { screen, Link } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <h1 style={{ fontSize: 40 }}>
        The shop
      </h1>
      <span>A page whose largest element is its heading, and which a visitor leaves for the second screen.</span>
      <Link to={secondScreen}>To the second screen</Link>
    </main>
  ),
})

export const secondScreen = screen('secondScreen', {
  path: '/second',
  access: 'anyone',
  title: 'Second',
  view: () => <h1>The second screen</h1>,
})
