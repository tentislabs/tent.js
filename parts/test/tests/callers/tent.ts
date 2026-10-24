import { project } from 'tentjs'

// The tests of one file ask from one address: the counts of a minute are set far above them.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
})
