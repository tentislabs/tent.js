import { screen, read, Form, Link } from 'tentjs/ui'
import { addNote, allNotes, dropNote, noteOf } from './functions'

// A list whose every row holds a form with an id of its own, and below it a form with none.
export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'anyone',
  title: 'Notes',
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>
            <Link to={`/notes/${n.id}`}>{n.note}</Link>
            <Form id={`drop-${n.id}`} call={dropNote} with={{ id: n.id }}>
              <button type="submit">Drop</button>
            </Form>
          </li>
        ))}
      </ul>
      <Form call={addNote} then={{ goTo: '/added' }}>
        <input id="note" name="note" />
        <button type="submit" id="add">
          Add
        </button>
      </Form>
    </main>
  ),
})

export const addedScreen = screen('addedScreen', {
  path: '/added',
  access: 'anyone',
  title: 'Added',
  view: () => <h1>Added</h1>,
})

// The screen of one row, whose form removes that row and then goes back to the list.
export const noteScreen = screen('noteScreen', {
  path: '/notes/:id',
  access: 'anyone',
  title: 'A note',
  data: ({ params }) => ({ note: read(noteOf, { id: params.id }) }),
  view: ({ note }) =>
    note ? (
      <main>
        <h1>{note.note}</h1>
        <Form id="drop" call={dropNote} with={{ id: note.id }} then={{ goTo: '/notes' }}>
          <button type="submit" id="dropIt">
            Drop
          </button>
        </Form>
      </main>
    ) : (
      <h1>Gone</h1>
    ),
})

// Forms whose then leaves for an address that is no address a page may leave for, and last one that may.
const leaving = [
  'javascript:window.ran=1',
  'JAVASCRIPT:window.ran=1',
  ' javascript:window.ran=1',
  'java\nscript:window.ran=1',
  'data:text/html,<script>window.ran=1</script>',
  'vbscript:window.ran=1',
  'https://example.com/left',
]

export const leavingScreen = screen('leavingScreen', {
  path: '/leaving',
  access: 'anyone',
  title: 'Leaving',
  view: () => (
    <main>
      {leaving.map((href, k) => (
        <Form id={`leave-${k}`} key={href} call={addNote} with={{ note: `leave ${k}` }} then={{ href }}>
          <button type="submit" id={`go-${k}`}>
            Leave
          </button>
        </Form>
      ))}
    </main>
  ),
})
