import { screen, read, Link } from 'tentjs/ui'
import { allNotes } from './functions'
import { Badge } from './badge'

// A list, each row with a component of its own.
export const listScreen = screen('listScreen', {
  path: '/list',
  access: 'anyone',
  title: 'List',
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main
      id="page"
      data-at="page"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, minHeight: '100vh', background: '#f8fafc' }}
    >
      <h1 id="heading" data-at="heading" style={{ margin: 0 }}>
        The list
      </h1>
      {notes.map((note) => (
        <div key={note.id} id="row" data-at="row" style={{ display: 'flex', gap: 8, padding: 8, background: '#e0f2fe' }}>
          <span id="rowTitle" data-at="rowTitle">
            {note.title}
          </span>
          <Badge label={note.title} />
        </div>
      ))}
      <span data-at="bare">No id here</span>
      <Link to="/" id="back" data-at="back">
        Back
      </Link>
    </main>
  ),
})
