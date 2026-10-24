import { project } from 'tentjs'

export const sky = project('sky', {
  title: 'Sky',
  // Three browser engines ask from one address within a minute: no test of them is answered by a count.
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
})
