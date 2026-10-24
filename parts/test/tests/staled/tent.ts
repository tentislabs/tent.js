import { project } from 'tentjs'

// A shop behind a cache of its own, which drops what went stale by the keys of each answer.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  cache: { keysHeader: 'surrogate-key' },
})
