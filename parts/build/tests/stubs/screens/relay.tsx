import { choice, number, screen } from 'tentjs/ui'
import { markPaid, openOrders, told } from '../helpers/relay'

export const relayScreen = screen('relayScreen', {
  path: '/relay/:id',
  access: 'signedIn',
  state: {
    tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address' },
    page: { type: number({ default: 1 }), in: 'address' },
    wide: { type: choice(['yes', 'no'], { default: 'no' }), in: 'browser' },
  },
  view: () => told({ openOrders, markPaid }),
})
