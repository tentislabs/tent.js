import { component, read, screen, useUser } from 'tentjs/ui'
import { allNotes, headerNotes } from './functions'

export const Coming = component('Coming', {
  view: () => <span>Header coming</span>,
})

// A header of each visitor: it reads the user, and states that it answers each visitor their own, so it is a
// personal part of a screen that is kept.
export const Header = component('Header', {
  personal: true,
  data: { seen: read(headerNotes) },
  view: ({ user, seen }) => (
    <h2>
      Header of {user ? user.id : 'a stranger'}, {seen.length} seen
    </h2>
  ),
})

// A greeting that asks for the user by a hook: it states that it answers each visitor their own.
export const Greeting = component('Greeting', {
  personal: true,
  view: () => {
    const user = useUser()
    return <span>{`Welcome, ${user ? user.id : 'stranger'}`}</span>
  },
})

export const boardScreen = screen('boardScreen', {
  path: '/',
  access: 'anyone',
  cache: '5 minutes',
  loading: Coming,
  data: { all: read(allNotes) },
  view: ({ all }) => (
    <main>
      <Header />
      <Greeting />
      <h1>Board of {all.length} notes</h1>
      {all.map((o) => <span key={o.id}>{o.title}</span>)}
    </main>
  ),
})

export const publicBoard = screen('publicBoard', {
  path: '/public',
  access: 'anyone',
  cache: { for: '5 minutes', public: true },
  loading: Coming,
  data: { all: read(allNotes) },
  view: ({ all }) => (
    <main>
      <Header />
      <h1>Board of {all.length} notes</h1>
    </main>
  ),
})
