import { choice, list, project, text } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  state: {
    // A visitor's choice of light or dark, which the first HTML of the next visit already knows.
    mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' },
    // What is too large for a cookie and need not be right in the first paint.
    looked: { type: list(text(), { optional: true }), in: 'browser' },
  },
})
