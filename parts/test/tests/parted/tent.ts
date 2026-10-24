import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
})
