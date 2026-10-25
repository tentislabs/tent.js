import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Orders',
  currency: 'USD',
  languages: ['en', 'tr'],
  signInPath: '/sign-in',
  uploads: 'signedIn',
})
