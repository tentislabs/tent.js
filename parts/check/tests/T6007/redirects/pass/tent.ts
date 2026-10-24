import { project } from 'tentjs'

// Redirects from addresses that no screen, no other redirect and no route that states `GET` holds.
export const shop = project('shop', {
  currency: 'USD',
  redirects: [
    { from: '/old-orders/:id', to: '/orders/:id' },
    { from: '/orders/:id/old', to: '/orders/:id' },
    { from: '/feed', to: '/feed.xml' },
  ],
})
