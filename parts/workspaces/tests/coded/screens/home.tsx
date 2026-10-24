import { anyone, read, screen } from 'tentjs/ui'
import { allNotes } from '../functions/users'

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: 'Notes',
  access: anyone('the notes of a test app'),
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h1>
        Notes
      </h1>
      {notes.length ? notes.map((note, place) => <span key={place}>{note.body}</span>) : <span style={{ color: '#5f6672' }}>No notes</span>}
    </main>
  ),
})
