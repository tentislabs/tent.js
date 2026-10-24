import { screen, read, text, useCall, useGoTo, Form, Link } from 'tentjs/ui'
import { addNote, allNotes, later, noteOf, refused } from './functions'

// Addresses that lead out of the app, worked out while running, so that only the page can refuse them.
const away = ['\\evil.example', '\t/evil.example', 'a//evil.example']

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => (
    <main>
      <h1>Home</h1>
      <Link id="plain" to={notesScreen}>Notes</Link>
      <Link id="blank" to={notesScreen} target="_blank">Notes elsewhere</Link>
      <Link id="setting" to={notesScreen} set={{ seen: 'from home' }}>Notes, seen</Link>
      <Link id="staying" set={{ seen: 'stayed' }}>Stay</Link>
      <Link id="evil" to={`/${away[0]}`}>Away</Link>
    </main>
  ),
})

export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'anyone',
  title: 'Notes',
  data: { notes: read(allNotes), slow: read(later, {}, { wait: false }) },
  view: ({ notes, slow, calls, state }) => (
    <main>
      <h1>Notes</h1>
      <p id="seen">{state.seen}</p>
      <p id="later">{calls.slow.busy ? 'waiting' : (slow ?? 'nothing')}</p>
      <ul>
        {notes.map((one) => (
          <li key={one.id} className="note">
            {one.words}
          </li>
        ))}
      </ul>
      <Form id="add" call={addNote} then={(made) => ({ goTo: noteScreen, with: { id: made.id } })}>
        <input name="words" />
        <button type="submit" id="send">Add</button>
      </Form>
      <Link id="home" to={homeScreen}>Home</Link>
    </main>
  ),
})

export const noteScreen = screen('noteScreen', {
  path: '/notes/:id',
  access: 'anyone',
  title: 'A note',
  data: ({ params }) => ({ note: read(noteOf, { id: params.id }, { needed: true }) }),
  view: ({ note }) => (
    <main>
      <h1 id="note">{note.words}</h1>
    </main>
  ),
})

/** Presses that call through `useCall`, and moves to addresses that lead out of the app, each of which goes nowhere. */
function Presses() {
  const asked = useCall(refused)
  const adding = useCall(addNote)
  const goTo = useGoTo()
  return (
    <section>
      <button type="button" id="yes" disabled={asked.busy} onClick={() => void asked.call({ words: 'yes' }).catch(() => undefined)}>
        Yes
      </button>
      <button type="button" id="no" onClick={() => void asked.call({ words: 'no' }).catch(() => undefined)}>
        No
      </button>
      <button type="button" id="addHeld" onClick={() => void adding.call({ words: 'held' }).catch(() => undefined)}>
        Add
      </button>
      <p id="held">{`${adding.held} ${adding.busy}`}</p>
      <p id="busy">{String(asked.busy)}</p>
      <p id="error">{asked.error?.message ?? ''}</p>
      <p id="value">{asked.value ?? ''}</p>
      <button type="button" id="goBackslash" onClick={() => goTo(`/${away[0]}`)}>
        Away
      </button>
      <button type="button" id="goTab" onClick={() => goTo(`/${away[1]}`)}>
        Away
      </button>
      <button type="button" id="goDouble" onClick={() => goTo(`/${away[2]}`)}>
        Away
      </button>
    </section>
  )
}

export const pressesScreen = screen('pressesScreen', {
  path: '/presses',
  access: 'anyone',
  title: 'Presses',
  view: () => (
    <main>
      <Presses />
      <Form id="away" call={addNote} then={() => ({ goTo: `/${away[2]}` })}>
        <input name="words" />
        <button type="submit" id="sendAway">Add</button>
      </Form>
    </main>
  ),
})
