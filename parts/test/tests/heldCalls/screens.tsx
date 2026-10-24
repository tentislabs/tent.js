import { screen, read, Link, Form } from 'tentjs/ui'
import { addNote, allNotes } from './functions'

// Two presses that each add a note, which say whether their call is held, under way, or failed.
export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'anyone',
  title: 'Notes',
  data: { all: read(allNotes) },
  view: ({ all, calls }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{all.length} notes</h1>
      <Form call={addNote} with={{ words: 'first' }} id="first"><button type="submit">
        {calls.first.held ? 'First waits' : calls.first.error ? `First ${calls.first.error.code}` : 'Add the first'}
      </button></Form>
      <Form call={addNote} with={{ words: 'second' }} id="second"><button type="submit">
        {calls.second.held
          ? 'Second waits'
          : calls.second.error
            ? `Second ${calls.second.error.code}`
            : 'Add the second'}
      </button></Form>
      <Link to={otherScreen}>To the other screen</Link>
    </main>
  ),
})

export const otherScreen = screen('otherScreen', {
  path: '/other',
  access: 'anyone',
  title: 'Other',
  view: () => <h1>The other screen</h1>,
})
