import { project } from 'tentjs'

// The tests of one file ask from few addresses: the counts of a minute are set far above them, but for the counts
// of the files themselves, which a test runs into.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
})
