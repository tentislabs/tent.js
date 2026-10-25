import { project } from 'tentjs'

// A step of a test that never lands fails after two seconds here.
export const held = project('held', {
  title: 'Held',
  limits: { testStep: '5 seconds', anyonePerMinute: 100000, screensPerMinute: 100000 },
})
