import { screen, read, choice, text } from 'tentjs/ui'
import { allNews, newsById } from './functions'

export const newsScreen = screen('newsScreen', {
  path: '/news',
  access: 'anyone',
  title: 'The news',
  cache: '5 minutes',
  state: {
    tab: { type: choice(['all', 'new'], { optional: true }), in: 'address' },
    search: { type: text({ default: '' }), in: 'address' },
  },
  data: { all: read(allNews) },
  view: ({ all, state }) => (
    <main>
      <h1>The news {state.tab ?? ''}</h1>
      {all.map((o) => <span key={o.id}>{o.title}</span>)}
    </main>
  ),
})

export const sharedScreen = screen('sharedScreen', {
  path: '/shared',
  access: 'anyone',
  title: 'Shared',
  cache: { for: '1 minute', public: true },
  data: { all: read(allNews) },
  view: ({ all }) => <h1>{all.length} shared</h1>,
})

export const oneScreen = screen('oneScreen', {
  path: '/news/:id',
  access: 'anyone',
  title: 'One',
  cache: '5 minutes',
  data: ({ params }) => ({ one: read(newsById, { id: params.id }, { needed: true }) }),
  view: ({ one }) => <h1>{one.title}</h1>,
})
