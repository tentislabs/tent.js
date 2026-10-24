import { project } from 'tentjs'

export const desk = project('desk', {
  title: 'Desk',
  backups: { every: false },
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
