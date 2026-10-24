import { project } from 'tentjs'

export const desk = project('desk', {
  title: 'Desk',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
