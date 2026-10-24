import { project } from 'tentjs'

// Three engines ask from one address within a minute: no test of them is answered by a count.
export const inspected = project('inspected', {
  title: 'Inspected',
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000, screensPerMinute: 1000000 },
})
