import { project } from 'tentjs'

// The app that the attacks of who is calling, of secrets and of mail are tried on. The tests of one file ask from
// few addresses: the counts of a minute are set far above them.
export const shop = project('shop', {
  title: 'Shop',
  mail: { from: 'shop@example.com' },
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000, screensPerMinute: 1000000 },
})
