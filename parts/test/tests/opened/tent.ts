import { project } from 'tentjs'

// A step of a test that never lands fails after five seconds here, room enough for a busy computer to load a page,
// and an action that never answers ends after eight.
export const shop = project('shop', {
  title: 'Shop',
  limits: {
    testStep: '5 seconds',
    actionTime: '8 seconds',
    anyonePerMinute: 100000,
    callerPerMinute: 100000,
    screensPerMinute: 100000,
  },
})
