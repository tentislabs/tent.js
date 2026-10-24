import { screen, choice, Link } from 'tentjs/ui'
import { ordersScreen } from './orders'

// A top-level `const` whose value is a plain value written in place: the title that reads it is stored as a value.
const LABELS = { open: 'Open', paid: 'Paid' }

export const labelsScreen = screen('labelsScreen', {
  path: '/labels',
  access: 'anyone',
  state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address' } },
  title: ({ state }) => `${LABELS[state.tab]} orders`,
  view: ({ state }) => (
    <main>
      <h1>{LABELS[state.tab]}</h1>
      <Link to={ordersScreen}>All orders</Link>
    </main>
  ),
})
