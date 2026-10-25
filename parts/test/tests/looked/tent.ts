import { project } from 'tentjs'

// A step of a test that never lands fails after five seconds here, room enough for a busy computer to load a page,
// and an action that never answers ends after eight.
export const looked = project('looked', {
  title: 'Looked',
  limits: {
    testStep: '5 seconds',
    actionTime: '8 seconds',
    anyonePerMinute: 100000,
    callerPerMinute: 100000,
    screensPerMinute: 100000,
  },
})
