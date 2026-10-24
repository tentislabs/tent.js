import { project } from 'tentjs'

// The shop of the tests of what is written of the counts: each caller is counted, in the zone of UTC.
export const shop = project('shop', {
  title: 'Shop',
  zone: 'UTC',
  countBy: 'caller',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, looseKept: '7 days' },
})
