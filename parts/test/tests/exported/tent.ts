import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  // One browser asks for many pages within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
