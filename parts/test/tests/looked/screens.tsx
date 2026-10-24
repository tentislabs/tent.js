import { screen, read, boolean, component, text, Link, Form } from 'tentjs/ui'
import { allDeals, never } from './functions'

// A view that counts the days to the end of each deal by the time of the page.
export const dealsScreen = screen('dealsScreen', {
  path: '/deals',
  access: 'anyone',
  title: 'Deals',
  data: { deals: read(allDeals) },
  view: ({ deals }) => {
    const now = Date.now()
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        {deals.map((deal) => {
          const days = Math.ceil((new Date(deal.endsAt).getTime() - now) / 86_400_000)
          return <span key={deal.id}>{days > 0 ? `${deal.title} ends in ${days} days` : `${deal.title} has ended`}</span>
        })}
      </main>
    )
  },
})

// A screen whose box moves when the link is pressed, and a press whose call never answers.
export const plainScreen = screen('plainScreen', {
  path: '/plain',
  access: 'anyone',
  title: 'Plain',
  state: { moved: boolean({ default: false }) },
  view: ({ state }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, width: 400 }}>
      <h1>A plain page</h1>
      <Link set={{ moved: !state.moved }}>Move</Link>
      <Form call={never}><button type="submit">Never</button></Form>
      <div id="box" style={{ padding: state.moved ? 48 : 8, background: '#1d4ed8' }}>
        <span style={{ color: '#ffffff' }}>The box</span>
      </div>
    </main>
  ),
})

export const Badge = component('Badge', {
  props: { label: text() },
  view: ({ label }) => (
    <div id="badge" style={{ background: '#fde68a' }}>
      <span id="badgeText">{label}</span>
    </div>
  ),
})

// A screen that uses the badge, so that it is a part of the app.
export const badgeScreen = screen('badgeScreen', {
  path: '/badge',
  access: 'anyone',
  title: 'Badge',
  view: () => <Badge label="On a screen" />,
})
