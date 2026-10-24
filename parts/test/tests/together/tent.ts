import { project } from 'tentjs'

// The pages of the tests ask from one address: the counts of a minute are set far above them.
export const together = project('together', {
  title: 'Together',
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000, screensPerMinute: 1000000 },
})
