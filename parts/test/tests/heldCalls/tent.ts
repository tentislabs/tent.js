import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // A call is held a few seconds here, so that a test sees it fail once it was held too long.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000, callHold: '4 seconds' },
})
