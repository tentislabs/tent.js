import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // A zone ahead of UTC: a moment late in the evening there is already the next day.
  zone: 'Europe/Istanbul',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
