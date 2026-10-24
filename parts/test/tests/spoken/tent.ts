import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  languages: ['en', 'tr', 'ar'],
  currency: 'USD',
  zone: 'UTC',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
