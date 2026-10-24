import { project } from 'tentjs'

// Many pages of the tests ask from one address: the counts of a minute and of an address are set far above them.
export const board = project('board', {
  title: 'Board',
  limits: {
    anyonePerMinute: 1000000,
    callerPerMinute: 1000000,
    screensPerMinute: 1000000,
    liveConnections: 2000,
  },
})
