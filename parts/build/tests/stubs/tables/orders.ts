import { choice, number, table, text, where } from 'tentjs'

export const orders = table('orders', {
  columns: { total: number({ min: 0 }), note: text({ optional: true }), status: choice(['open', 'paid'], { default: 'open' }) },
  // A rule whose arrow is code: nothing of it may reach a screen.
  access: {
    read: where((user) => {
      let marker = 'MARKER-OF-THE-RULE-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      marker = marker.toLowerCase()
      return user ? { note: { not: marker } } : { status: 'none' }
    }),
    change: 'signedIn',
  },
})
