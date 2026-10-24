import { screen, read } from 'tentjs/ui'
import { allNews } from './functions'

// Kept by a cache outside the engine as well as by the engine's own.
export const sharedScreen = screen('sharedScreen', {
  path: '/shared',
  access: 'anyone',
  title: 'Shared',
  cache: { for: '1 minute', public: true },
  data: { all: read(allNews) },
  view: ({ all }) => <h1>{all.length} shared</h1>,
})

// Kept by the engine alone.
export const newsScreen = screen('newsScreen', {
  path: '/news',
  access: 'anyone',
  title: 'The news',
  cache: '5 minutes',
  data: { all: read(allNews) },
  view: ({ all }) => (
    <main>
      {all.map((o) => <span key={o.id}>{o.title}</span>)}
    </main>
  ),
})
