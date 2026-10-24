import { component, screen, boolean, number, text, Link } from 'tentjs/ui'

// The component that the screen is shown inside: it places the screen, and is told which screen it wraps.
export const Shell = component('Shell', {
  view: ({ screen, children }) => (
    <main id="shell" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span id="where">{screen.name} {screen.address}</span>
      {children}
    </main>
  ),
})

// Each use draws the name it is given on its outer element, by which a test finds it.
export const Pager = component('Pager', {
  props: { which: text() },
  state: {
    page: { type: number({ default: 1, min: 1, max: 9, whole: true }), in: 'address', back: true },
    open: boolean(),
  },
  view: ({ state, which }) => (
    <div id={which} style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
      <Link set={{ page: state.page + 1 }} id="more">More</Link>
      <span id="shown">{state.page}</span>
      <Link set={{ open: !state.open }} id="toggle">{state.open ? 'open' : 'shut'}</Link>
    </div>
  ),
})

export const pagersScreen = screen('pagersScreen', {
  path: '/pagers',
  access: 'anyone',
  title: 'Pagers',
  layout: Shell,
  view: () => (
    <div id="page" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'start', padding: 16 }}>
      <Pager id="top" which="top" />
      <Pager id="low" which="low" />
    </div>
  ),
})
