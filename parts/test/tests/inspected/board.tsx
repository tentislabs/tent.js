import { screen, read, Link, Form } from 'tentjs/ui'
import { press, pressCount } from './functions'
import { Badge } from './badge'

// The board. Each tag carries `data-at`, by which a test tells what the page should say of the element under a point.
export const boardScreen = screen('boardScreen', {
  path: '/',
  access: 'anyone',
  title: 'Board',
  data: { pressed: read(pressCount) },
  view: ({ pressed }) => (
    <main
      id="board"
      data-at="board"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minHeight: '100vh', background: '#f4f4f5' }}
    >
      <h1 id="title" data-at="title" style={{ fontSize: 28, margin: 0 }}>
        The board
      </h1>
      <div id="top" data-at="top" style={{ display: 'flex', gap: 12 }}>
        <div id="left" data-at="left" style={{ padding: 8, width: 200, height: 80, background: '#bfdbfe' }}>
          <span id="leftText" data-at="leftText">
            Left
          </span>
        </div>
        <div id="right" data-at="right" style={{ padding: 8, width: 200, height: 80, background: '#fecaca' }}>
          <Badge label="On the right" />
        </div>
      </div>
      <span id="count" data-at="count">
        {pressed} presses
      </span>
      <span data-at="bare">No id here</span>
      <Form call={press} id="pressing" data-at="pressForm">
        <button type="submit" id="press" data-at="press" style={{ width: 120, background: '#22c55e' }}>
          Press
        </button>
      </Form>
      <Link to="/list" id="toList" data-at="toList">
        To the list
      </Link>
      <div id="riser" data-at="riser" style={{ width: 160, height: 60, background: '#6366f1' }} />
    </main>
  ),
})
