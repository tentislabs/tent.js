import { screen, read, Link } from 'tentjs/ui'
import { allNotes } from './functions'
import { echoScreen, restScreen } from './screens'

// The text of a row as the place a press leads to: a path, and a value of the address of another screen.
export const linksScreen = screen('linksScreen', {
  path: '/links',
  access: 'anyone',
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <div>
      {notes.map((note, place) => (
          <div key={place}>
            <Link to={note.to}>a link by its path</Link>
            <Link to={note.to}>
              <span>a box that is a link</span>
            </Link>
            <Link to={echoScreen} with={{ word: note.to, said: note.to }}>
              a link to a screen
            </Link>
            <Link to={restScreen} with={{ rest: note.to }}>
              a link to the rest of an address
            </Link>
          </div>
        ))}
    </div>
  ),
})
