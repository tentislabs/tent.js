import { screen, choice } from 'tentjs/ui'

// A constant that the view reads, and one that only an option reads.
const LABELS = { open: 'Open', paid: 'Paid' }
const SIZES = [12, 16, 24]
const TITLE = 'Constants'

export const constantsScreen = screen('constantsScreen', {
  path: '/constants',
  access: 'anyone',
  state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address' } },
  title: ({ state }) => `${LABELS[state.tab]} orders`,
  view: ({ state }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>{LABELS[state.tab]}</span>
      <span>{state.tab === 'open' ? LABELS.open : `not ${LABELS.open}`}</span>
    </div>
  ),
})

export const titledScreen = screen('titledScreen', {
  path: '/titled',
  access: 'anyone',
  title: TITLE,
  view: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>Titled</span>
    </div>
  ),
})
