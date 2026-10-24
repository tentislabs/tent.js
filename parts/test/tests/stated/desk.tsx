import { screen, read, boolean, choice, number, text, Link } from 'tentjs/ui'
import { itemNamed, itemsOf } from './functions'

export const deskScreen = screen('deskScreen', {
  path: '/desk',
  access: 'anyone',
  title: 'The desk',
  state: {
    kind: { type: choice(['tool', 'toy'], { default: 'tool' }), in: 'address', back: true },
    page: { type: number({ default: 1, min: 1, max: 9, whole: true }), in: 'address', back: true, reset: ['kind', 'name'] },
    name: { type: text({ default: '' }), in: 'address' },
    seen: { type: boolean(), in: 'device' },
    draft: { type: text({ optional: true }), in: 'browser' },
  },
  data: ({ state }) => ({
    items: read(itemsOf, { kind: state.kind }),
    named: read(itemNamed, { name: state.name }),
  }),
  view: ({ items, named, state, set }) => (
    <div id="page" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'start', padding: 16 }}>
      <Link set={{ kind: 'tool' }} id="tools">Tools</Link>
      <Link set={{ kind: 'toy' }} id="toys">Toys</Link>
      <Link set={{ page: state.page + 1 }} id="next">Next</Link>
      <span id="at">{state.kind} {state.page}</span>
      <div id="list">
        {items.map((o, place) => <span key={place}>{o.name}</span>)}
      </div>
      <input id="search" value={state.name} onChange={(event) => set({ name: event.target.value })} />
      <span id="found">{named ? named.name : 'none'}</span>
      <Link set={{ seen: true }} id="see">Seen</Link>
      <span id="wasSeen">{state.seen ? 'seen' : 'new'}</span>
      <input id="draft" value={state.draft ?? ''} onChange={(event) => set({ draft: event.target.value })} />
      <span id="mode">{state.mode}</span>
      <Link set={{ mode: 'dark' }} id="dark">Dark</Link>
      <Link set={{ looked: ['Saw', 'Kite'] }} id="look">Look</Link>
      <span id="looked">{state.looked ? state.looked.length : 0}</span>
    </div>
  ),
})
