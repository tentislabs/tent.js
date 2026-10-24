import { screen, read, role, text, Form } from 'tentjs/ui'
import {
  addNote,
  allNotes,
  leaks,
  posts,
  staffNotes,
  writesAsSystem,
  writesByChange,
  writesBySql,
  writesLater,
  writesThroughAction,
} from './functions'

// The text of a row, shown in an element, in the title and in the page record.
export const shownScreen = screen('shownScreen', {
  path: '/',
  access: 'anyone',
  title: ({ notes }) => notes.map((note) => note.title).join(' | '),
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main>
      {notes.map((note, place) => (
          <div key={place} aria-label={note.title}>
            <h2>{note.title}</h2>
            <span>The note says {note.title} and no more</span>
          </div>
        ))}
    </main>
  ),
})

// The same texts in a view that is code, and in every place of a field and a form that takes words.
export const codeScreen = screen('codeScreen', {
  path: '/code',
  access: 'anyone',
  title: ({ notes }) => String(notes[0]?.title),
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <div>
      {notes.map((note) => (
        <Form call={addNote} aria-label={note.title} values={{ title: note.title }}>
          <h2>{String(note.title).trim()}</h2>
          <input name="title" placeholder={note.title} aria-describedby="help" />
          <span id="help">{note.title}</span>
        </Form>
      ))}
    </div>
  ),
})

// What the address itself carries, written into the page: a value of the address, and a state kept in it.
export const echoScreen = screen('echoScreen', {
  path: '/echo/:word',
  access: 'anyone',
  state: { said: { type: text({ default: 'nothing' }), in: 'address' } },
  title: ({ params, state }) => `${params.word} and ${state.said}`,
  view: ({ params, state }) => (
    <div aria-label={params.word}>
      <h1>{params.word}</h1>
      <span>{state.said}</span>
    </div>
  ),
})

export const restScreen = screen('restScreen', {
  path: '/rest/*',
  access: 'anyone',
  view: ({ params }) => <span>{params.rest}</span>,
})

// Screens that not every caller may see.
export const accountScreen = screen('accountScreen', {
  path: '/account',
  access: 'signedIn',
  view: ({ user }) => <span>Account of {user.id}</span>,
})

export const staffScreen = screen('staffScreen', {
  path: '/staff',
  access: role('staff'),
  framedBy: ['https://studio.example.com'],
  state: { tab: { type: text({ default: 'all' }), in: 'address' } },
  data: { notes: read(staffNotes) },
  view: ({ notes }) => <span>{notes.length} for the staff</span>,
})

export const staffOneScreen = screen('staffOneScreen', {
  path: '/staff/:id',
  access: role('staff'),
  view: ({ params }) => <span>The staff sees {params.id}</span>,
})

// Open to everyone, with an entry that the staff alone may read.
export const mixedScreen = screen('mixedScreen', {
  path: '/mixed',
  access: 'anyone',
  data: { notes: read(staffNotes) },
  view: ({ notes }) => <span>{notes.length} mixed</span>,
})

export const framedScreen = screen('framedScreen', {
  path: '/framed',
  access: 'anyone',
  framedBy: ['https://studio.example.com'],
  view: () => <span>Shown in the studio</span>,
})

// Screens whose `data` holds an action that writes, each by a way of its own.
export const byChangeScreen = screen('byChangeScreen', {
  path: '/writes/change',
  access: 'anyone',
  data: { answer: read(writesByChange) },
  view: () => <span>Never drawn</span>,
})

export const throughActionScreen = screen('throughActionScreen', {
  path: '/writes/action',
  access: 'anyone',
  data: { answer: read(writesThroughAction) },
  view: () => <span>Never drawn</span>,
})

export const asSystemScreen = screen('asSystemScreen', {
  path: '/writes/system',
  access: 'anyone',
  data: { answer: read(writesAsSystem) },
  view: () => <span>Never drawn</span>,
})

export const bySqlScreen = screen('bySqlScreen', {
  path: '/writes/sql',
  access: 'anyone',
  data: { answer: read(writesBySql) },
  view: () => <span>Never drawn</span>,
})

export const laterScreen = screen('laterScreen', {
  path: '/writes/later',
  access: 'anyone',
  data: { answer: read(writesLater) },
  view: ({ answer }) => <span>The action {answer}</span>,
})

export const notWaitedScreen = screen('notWaitedScreen', {
  path: '/writes/unwaited',
  access: 'anyone',
  data: { answer: read(writesByChange, {}, { wait: false }) },
  view: () => <span>Sent before the action</span>,
})

export const postsScreen = screen('postsScreen', {
  path: '/writes/post/:port',
  access: 'anyone',
  data: ({ params }) => ({ answer: read(posts, { to: `http://127.0.0.1:${params.port}/taken` }) }),
  view: ({ answer }) => <span>Posted with {answer}</span>,
})

export const leaksScreen = screen('leaksScreen', {
  path: '/leaks',
  access: 'anyone',
  data: { answer: read(leaks) },
  view: () => <span>Never drawn</span>,
})

const breaks = (): never => {
  throw new Error('the view holds SECRET-OF-THE-VIEW-0123456789')
}

export const brokenScreen = screen('brokenScreen', {
  path: '/broken',
  access: 'anyone',
  view: () => <span>{breaks()}</span>,
})
