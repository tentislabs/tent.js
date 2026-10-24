import { project } from 'tentjs'

// A step of a test that never lands fails after two seconds here, and an action that never answers ends after three.
export const shop = project('shop', {
  title: 'Shop',
  limits: {
    testStep: '2 seconds',
    actionTime: '3 seconds',
    anyonePerMinute: 100000,
    callerPerMinute: 100000,
    screensPerMinute: 100000,
  },
})
