import { project } from 'tentjs'

// A shop that releases a new version to half of its callers first.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
  release: { steps: [0.5, 1], every: '1 hour' },
})
