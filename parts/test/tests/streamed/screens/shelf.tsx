import { component, read, screen } from 'tentjs/ui'
import { allNotes, slowCount, slowFailing, slowNote } from '../functions/shelf'

export const Waiting = component('Waiting', {
  view: () => <span>Counting still</span>,
})

export const SlowCount = component('SlowCount', {
  data: { count: read(slowCount, { upTo: 6000000 }) },
  view: ({ count }) => <span>Counted to {count}</span>,
})

export const FailingCount = component('FailingCount', {
  data: { count: read(slowFailing, { upTo: 6000000 }) },
  view: ({ calls }) => <span>The count failed with {calls.count.error?.code}</span>,
})

export const shelfScreen = screen('shelfScreen', {
  path: '/',
  access: 'anyone',
  loading: Waiting,
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>Notes on the shelf: {notes.length}</span>
      <SlowCount />
      <span>Below the count</span>
    </main>
  ),
})

export const failingScreen = screen('failingScreen', {
  path: '/failing',
  access: 'anyone',
  loading: Waiting,
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>Notes on the shelf: {notes.length}</span>
      <FailingCount />
      <span>Below the count</span>
    </main>
  ),
})

export const noteScreen = screen('noteScreen', {
  path: '/notes/:name',
  access: 'anyone',
  loading: Waiting,
  data: ({ params }) => ({ note: read(slowNote, { name: params.name, upTo: 3000000 }, { needed: true }) }),
  view: ({ note }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>The note {note.name}</span>
      <SlowCount />
    </main>
  ),
})

export const publicScreen = screen('publicScreen', {
  path: '/public',
  access: 'anyone',
  cache: { for: '5 minutes', public: true },
  loading: Waiting,
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>Notes on the shelf: {notes.length}</span>
      <SlowCount />
    </main>
  ),
})
