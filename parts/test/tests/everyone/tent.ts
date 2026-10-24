import { project } from 'tentjs'

export const everyone = project('everyone', {
  title: 'Everyone',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },
})
