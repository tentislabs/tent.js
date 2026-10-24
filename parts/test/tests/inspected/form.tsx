import { screen, Form, Link } from 'tentjs/ui'
import { addNote } from './functions'

// A form over a change.
export const formScreen = screen('formScreen', {
  path: '/form',
  access: 'anyone',
  title: 'Form',
  view: () => (
    <main
      id="page"
      data-at="page"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, minHeight: '100vh', background: '#fafaf9' }}
    >
      <h1 id="heading" data-at="heading" style={{ margin: 0 }}>
        A note
      </h1>
      <Form id="adding" call={addNote} data-at="adding" style={{ display: 'flex', gap: 8, padding: 8, background: '#e7e5e4' }}>
        <input name="title" id="noteTitle" data-at="noteTitle" aria-label="Title" />
        <button type="submit" id="send" data-at="send" style={{ background: '#a7f3d0' }}>
          Add
        </button>
      </Form>
      <span data-at="bare">No id here</span>
      <Link to="/" id="home" data-at="home">
        Home
      </Link>
    </main>
  ),
})
