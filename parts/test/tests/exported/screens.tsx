import { screen, read, Form, Link } from 'tentjs/ui'
import { addNote, allNotes, noteBySlug } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'The notes',
  data: { all: read(allNotes) },
  view: ({ all }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>The notes</h1>
      {all.map((o) => <Link key={o.id} to={'/notes/' + o.slug} id="open">{o.body}</Link>)}
      <Link to="/about" id="about">About</Link>
    </main>
  ),
})

export const aboutScreen = screen('aboutScreen', {
  path: '/about',
  access: 'anyone',
  title: 'About',
  view: () => <h1>About the notes</h1>,
})

export const noteScreen = screen('noteScreen', {
  path: '/notes/:slug',
  access: 'anyone',
  title: ({ note }) => note.body,
  seo: { addresses: read(allNotes) },
  data: ({ params }) => ({ note: read(noteBySlug, { slug: params.slug }, { needed: true }) }),
  view: ({ note }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{note.body}</h1>
      <Link to="/" id="home">All notes</Link>
    </main>
  ),
})

export const pickedScreen = screen('pickedScreen', {
  path: '/picked/:id',
  access: 'anyone',
  title: 'Picked',
  view: ({ params }) => <h1>Picked {params.id}</h1>,
})

export const deskScreen = screen('deskScreen', {
  path: '/desk',
  access: 'signedIn',
  title: 'The desk',
  view: () => <h1>The desk</h1>,
})

export const addScreen = screen('addScreen', {
  path: '/add',
  access: 'anyone',
  title: 'A new note',
  data: { all: read(allNotes) },
  view: ({ all }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>A new note</h1>
      <Form id="add" call={addNote}>
        <input name="slug" id="slug" />
        <input name="body" id="body" />
        <button type="submit" id="send">Add</button>
      </Form>
      {all.map((o) => <span key={o.id} id="note">{o.body}</span>)}
    </main>
  ),
})
