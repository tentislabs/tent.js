import { screen } from 'tentjs/ui'
// A package between the screen and the backend file, which the test writes into `node_modules`.
import { markPaid, openOrders } from 'relay-package'

const told = (what: object): string => JSON.stringify(what)

export const packagedScreen = screen('packagedScreen', {
  path: '/packaged',
  access: 'signedIn',
  view: () => told({ openOrders, markPaid }),
})
