import { project, text } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  // A state of the whole app, which a link sets before it moves.
  state: { seen: { type: text({ default: '', max: 40 }), in: 'device' } },
})
