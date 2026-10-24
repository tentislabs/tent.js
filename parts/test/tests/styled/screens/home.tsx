import { Link, screen } from 'tentjs/ui'

// The home screen draws neither component.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => (
    <main>
      <h1 id="home">Home</h1>
      <Link to="/sky" id="toSky">
        Sky
      </Link>
    </main>
  ),
})
