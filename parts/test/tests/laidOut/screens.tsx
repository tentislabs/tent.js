import { component, Link, screen } from 'tentjs/ui'

export const Frame = component('Frame', {
  view: ({ children }) => (
    <div className="frame">
      <header id="bar">The bar</header>
      {children}
    </div>
  ),
})

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  layout: Frame,
  view: () => (
    <main>
      <h1>Home</h1>
      <Link id="tall" to="/tall">
        Tall
      </Link>
      <Link id="nowhere" to="/nowhere">
        Nowhere
      </Link>
    </main>
  ),
})

export const tallScreen = screen('tallScreen', {
  path: '/tall',
  access: 'anyone',
  layout: Frame,
  view: () => (
    <main>
      <h1>Tall</h1>
      <div style={{ height: 2000 }}>A tall block</div>
    </main>
  ),
})

export const lostScreen = screen('lostScreen', {
  for: 'notFound',
  access: 'anyone',
  layout: Frame,
  view: () => <h1>Lost</h1>,
})
