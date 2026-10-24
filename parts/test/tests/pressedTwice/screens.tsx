import { anyone, Link, screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: anyone('a screen of a test'),
  title: 'Home',
  view: () => <h1>Home</h1>,
})

// Two screens that each link to the other, so that a test moves there and back.
export const aScreen = screen('aScreen', {
  path: '/a',
  access: anyone('a screen of a test'),
  title: 'A',
  view: () => (
    <main>
      <h1>Screen A</h1>
      <Link to="/b">To B</Link>
    </main>
  ),
})

export const bScreen = screen('bScreen', {
  path: '/b',
  access: anyone('a screen of a test'),
  title: 'B',
  view: () => (
    <main>
      <h1>Screen B</h1>
      <Link to="/a">To A</Link>
    </main>
  ),
})
