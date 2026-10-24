import { component, screen, read, number, Link } from 'tentjs/ui'
import { itemNamed, itemsOf } from './functions'

// The component that both screens are shown inside: its links mark themselves, and it has a state of its own.
export const Bar = component('Bar', {
  state: { pressed: number({ default: 0 }) },
  view: ({ state, screen, children }) => (
    <nav id="bar" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      <Link to="/things" id="toTools">Things</Link>
      <Link to="/things/Saw" id="toSaw" exact>The saw</Link>
      <Link set={{ pressed: state.pressed + 1 }} id="press">Pressed {state.pressed}</Link>
      <span id="wraps">{screen.name}</span>
      {children}
    </nav>
  ),
})

export const thingsScreen = screen('thingsScreen', {
  path: '/things',
  access: 'anyone',
  title: 'Things',
  layout: Bar,
  data: { things: read(itemsOf, { kind: 'tool' }) },
  view: ({ things }) => (
    <div id="things" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h1 id="heading">Things</h1>
      {things.map((o) => <Link key={o.id} to={'/things/' + o.name} id="open">{o.name}</Link>)}
      <Link to="/things/Kite" above id="peek">Peek at the kite</Link>
      <div style={{ height: 1500 }} />
      <Link to="/things/Drill" id="low">The drill, from far down</Link>
    </div>
  ),
})

export const thingScreen = screen('thingScreen', {
  path: '/things/:name',
  access: 'anyone',
  title: ({ thing }) => (thing ? 'About ' + thing.name : 'No such thing'),
  layout: Bar,
  data: ({ params }) => ({ thing: read(itemNamed, { name: params.name }) }),
  view: ({ thing, params }) => (
    <div id="thing" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h1 id="heading">{params.name}</h1>
      <span id="kind">{thing ? thing.kind : 'none'}</span>
      <Link to="/things" id="back">All things</Link>
      <div style={{ height: 600 }} />
      <span id="price">The price</span>
      <Link to="#price" id="toPrice">See the price</Link>
    </div>
  ),
})
