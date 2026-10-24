import { project } from 'tentjs'

// A redirect from the address of a screen, two redirects from one address, and one from the address of a route
// that states `GET`.
export const shop = project('shop', {
  currency: 'USD',
  redirects: [
    { from: '/orders/:order', to: '/list' },
    { from: '/old', to: '/orders/one' },
    { from: '/old', to: '/orders/two' },
    { from: '/feed', to: '/feed.xml' },
  ],
})
