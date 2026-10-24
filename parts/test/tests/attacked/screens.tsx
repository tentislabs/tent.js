import { screen, Form, Link } from 'tentjs/ui'
import { touch } from './functions'

// Addresses that a value known only while running hands to `to` of a `Link` and to `href` of `then`: no link is
// drawn for any of them, and no move is made. The type of `to` refuses each, so the value is held as one of no type.
const evil = ['JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:msgbox(1)']

export const linksScreen = screen('linksScreen', {
  path: '/links',
  access: 'anyone',
  title: 'Links',
  view: () => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {evil.map((href) => (
        <Link to={href as never} id="evil" key={href}>
          Run
        </Link>
      ))}
      {evil.map((href) => (
        <Form call={touch} then={{ href }} key={href}>
          <button type="submit">Send</button>
        </Form>
      ))}
      <a href="https://example.com/help" id="good">Help</a>
    </main>
  ),
})

