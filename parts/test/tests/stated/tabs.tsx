import { screen, choice, Link } from 'tentjs/ui'

export const tabsScreen = screen('tabsScreen', {
  path: '/tabs',
  access: 'anyone',
  title: 'Tabs',
  state: { kind: { type: choice(['tool', 'toy', 'all'], { default: 'all' }), in: 'address' } },
  view: ({ state }) => (
    <div id="page" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <div id="tabs" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <Link to={tabsScreen} with={{ kind: 'all' }} id="all">All</Link>
        <Link to={tabsScreen} with={{ kind: 'tool' }} id="tools">Tools</Link>
        <Link to={tabsScreen} with={{ kind: 'toy' }} id="toys">Toys</Link>
      </div>
      <span id="shown">{state.kind}</span>
      <div id="menu" style={{ display: 'flex', flexDirection: 'row', gap: 8, background: '#f5f6f8' }}>
        <Link to="#first" id="toA">First</Link>
        <Link to="#second" id="toB">Second</Link>
        <Link to="#third" id="toC">Third</Link>
      </div>
      <div id="first" style={{ height: 700, background: '#ffffff' }}><span>The first part</span></div>
      <div id="second" style={{ height: 700, background: '#ffffff' }}><span>The second part</span></div>
      <div id="third" style={{ height: 700, background: '#ffffff' }}><span>The third part</span></div>
    </div>
  ),
})
