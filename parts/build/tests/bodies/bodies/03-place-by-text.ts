import { query } from 'tentjs'

const LABELS = { open: 'Open orders', paid: 'Paid orders' }
const TABS = ['open', 'paid']

export const placeByText = query('placeByText', {
  access: 'everyone',
  run: ({ input, db }) => {
    const rows = db.orders.where({ status: input.tab }).oldest('placedAt').all()
    const last = rows[rows.length - 1]
    return {
      label: LABELS[input.tab],
      open: LABELS.open,
      first: rows[0]?.id,
      last: last?.id,
      next: TABS[input.at + 1],
      count: input.counts['first order'],
      picked: input.counts[input.key],
      title: `${LABELS[input.tab] ?? 'Nothing'}: ${rows.length}`,
    }
  },
})
